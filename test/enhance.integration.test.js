import { test } from 'node:test'
import assert from 'node:assert/strict'
import { apply } from '../lib/index.js'

// 集成测试：以 fake ctx 完整驱动 apply 注册的 /api/prompt-enhance/enhance 路由，
// 覆盖成功链路与关键错误码，无需外部网络或真实 DSH 服务。

function makeReq(body) {
  const payload = JSON.stringify(body)
  const handlers = { data: [], end: [], error: [] }
  const req = {
    destroyed: false,
    on(event, cb) {
      const arr = handlers[event] || (handlers[event] = [])
      arr.push(cb)
      return req
    },
    destroy() { req.destroyed = true },
  }
  // 模拟流式请求体：data 一次发完，随后 end
  queueMicrotask(() => {
    for (const cb of handlers.data) cb(payload)
    for (const cb of handlers.end) cb()
  })
  return req
}

function makeRes() {
  const handlers = { close: [] }
  const res = {
    statusCode: 0,
    headers: {},
    body: '',
    writableFinished: false,
    writeHead(code, headers) { res.statusCode = code; res.headers = headers },
    end(body) { res.body = body; res.writableFinished = true },
    on(event, cb) {
      const arr = handlers[event] || (handlers[event] = [])
      arr.push(cb)
      return res
    },
    off(event, cb) {
      const arr = handlers[event] || []
      const i = arr.indexOf(cb)
      if (i >= 0) arr.splice(i, 1)
      return res
    },
  }
  return res
}

// 与真实 DSH fs 服务形态一致：resolve 返回目标对象，listDir/stat 接收目标对象
const fakeFs = {
  async resolve(p) {
    return { targetKey: p, displayPath: p }
  },
  async stat() { return { type: 'directory' } },
  async listDir(t) {
    const p = typeof t === 'string' ? t : t.targetKey
    if (p === '/workspace/proj') {
      return [
        { name: 'package.json', type: 'file', size: 50, target: { targetKey: '/workspace/proj/package.json', displayPath: '/workspace/proj/package.json' } },
        { name: 'src', type: 'directory', target: { targetKey: '/workspace/proj/src', displayPath: '/workspace/proj/src' } },
      ]
    }
    return []
  },
  async readText() { return '{"name":"demo"}' },
}

function makeLlm(opts = {}) {
  const { streamChunks = [], streamError = null } = opts
  let streamCalls = 0
  const llm = {
    listProviders: () => [{ id: 'p1' }],
    listModels: async () => [{ id: 'm1' }],
    async * stream() {
      streamCalls++
      if (streamError) throw streamError
      yield* streamChunks
    },
  }
  return { llm, streamCalls: () => streamCalls }
}

function makeCtx(opts = {}) {
  const routes = {}
  const ctx = {
    effect(fn) {
      const dispose = fn()
      return () => { if (dispose && typeof dispose === 'function') dispose() }
    },
    get(key) {
      if (key === 'sessions') return opts.sessions
      if (key === 'fs') return opts.fs || fakeFs
      if (key === 'llm') return opts.llm
      if (key === 'agentDefaultModel') return opts.agentDefaultModel
      return undefined
    },
    webServer: {
      register(desc) {
        routes[desc.path] = desc.handler
        return () => { delete routes[desc.path] }
      },
    },
  }
  return { ctx, routes }
}

const DEFAULT_SESSIONS = { get: () => ({ header: { cwd: '/workspace/proj' } }) }
const DEFAULT_MODEL = { currentSelection: () => ({ provider: 'p1', model: 'm1' }) }

test('enhance 路由：标准模式成功增强并剥离待确认段', async () => {
  const { llm, streamCalls } = makeLlm({
    streamChunks: [
      { type: 'text-delta', text: '增强正文' },
      { type: 'text-delta', text: '\n── 待确认 ──\n- 需要平台' },
      { type: 'finish', reason: { kind: 'stop' } },
    ],
  })
  const { ctx, routes } = makeCtx({ sessions: DEFAULT_SESSIONS, llm, agentDefaultModel: DEFAULT_MODEL })
  apply(ctx, {})
  const handler = routes['/api/prompt-enhance/enhance']
  assert.ok(handler, 'enhance 路由已注册')
  const res = makeRes()
  await handler(makeReq({ sessionId: 's1', draft: '写一个登录接口', mode: 'standard' }), res)
  const payload = JSON.parse(res.body)
  assert.equal(payload.ok, true)
  assert.equal(payload.mode, 'standard')
  assert.equal(payload.enhanced, '增强正文')
  assert.equal(payload.confirmations, '- 需要平台')
  assert.equal(streamCalls(), 1)
})

test('enhance 路由：基础模式成功（不读取项目上下文）', async () => {
  const { llm, streamCalls } = makeLlm({
    streamChunks: [
      { type: 'text-delta', text: '润色后的正文' },
      { type: 'finish', reason: { kind: 'stop' } },
    ],
  })
  const { ctx, routes } = makeCtx({ llm, agentDefaultModel: DEFAULT_MODEL })
  apply(ctx, {})
  const handler = routes['/api/prompt-enhance/enhance']
  const res = makeRes()
  await handler(makeReq({ sessionId: 's1', draft: '  帮我写个脚本  ', mode: 'basic' }), res)
  const payload = JSON.parse(res.body)
  assert.equal(payload.ok, true)
  assert.equal(payload.enhanced, '润色后的正文')
  assert.equal(streamCalls(), 1)
})

test('enhance 路由：空草稿返回 EMPTY_DRAFT', async () => {
  const { ctx, routes } = makeCtx({ llm: makeLlm({}).llm })
  apply(ctx, {})
  const handler = routes['/api/prompt-enhance/enhance']
  const res = makeRes()
  await handler(makeReq({ sessionId: 's1', draft: '   ', mode: 'standard' }), res)
  const payload = JSON.parse(res.body)
  assert.equal(payload.ok, false)
  assert.equal(payload.code, 'EMPTY_DRAFT')
})

test('enhance 路由：无候选模型返回 NO_CANDIDATES', async () => {
  const { ctx, routes } = makeCtx({
    llm: { listProviders: () => [], listModels: async () => [] },
    agentDefaultModel: undefined,
  })
  apply(ctx, { autoFill: false })
  const handler = routes['/api/prompt-enhance/enhance']
  const res = makeRes()
  await handler(makeReq({ sessionId: 's1', draft: '写一个登录接口', mode: 'basic' }), res)
  const payload = JSON.parse(res.body)
  assert.equal(payload.ok, false)
  assert.equal(payload.code, 'NO_CANDIDATES')
})

test('enhance 路由：模型全部失败返回 ALL_MODELS_FAILED', async () => {
  const { llm } = makeLlm({ streamError: new Error('gateway down') })
  const { ctx, routes } = makeCtx({ sessions: DEFAULT_SESSIONS, llm, agentDefaultModel: DEFAULT_MODEL })
  apply(ctx, { autoFill: false })
  const handler = routes['/api/prompt-enhance/enhance']
  const res = makeRes()
  await handler(makeReq({ sessionId: 's1', draft: '写一个登录接口', mode: 'standard' }), res)
  const payload = JSON.parse(res.body)
  assert.equal(payload.ok, false)
  assert.equal(payload.code, 'ALL_MODELS_FAILED')
  assert.ok(payload.message.includes('模型调用全部失败'))
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { apply } from '../lib/index.js'

// 集成测试：以 fake ctx 完整驱动 apply 注册的 /api/prompt-enhance/enhance 路由，
// 覆盖成功链路与关键错误码，无需外部网络或真实 DSH 服务。

function makeReq(body, options = {}) {
  const payload = typeof body === 'string' ? body : JSON.stringify(body)
  const handlers = { data: [], end: [], error: [] }
  const req = {
    destroyed: false,
    method: options.method || 'POST',
    headers: {
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
    paused: false,
    on(event, cb) {
      const arr = handlers[event] || (handlers[event] = [])
      arr.push(cb)
      return req
    },
    pause() { req.paused = true },
    destroy() { req.destroyed = true },
  }
  // 模拟流式请求体：data 一次发完，随后 end
  queueMicrotask(() => {
    for (const cb of handlers.data) cb(payload)
    if (!req.paused) for (const cb of handlers.end) cb()
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

test('enhance 路由：标准模式带会话历史（进入用户消息并记录 historyChars）', async () => {
  const sessions = {
    get: () => ({
      header: { cwd: '/workspace/proj' },
      deriveMessages: () => [
        { role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '之前讨论过登录方案' }] },
        { role: 'assistant', source: { kind: 'model' }, content: [{ type: 'text', text: '就用 FastAPI' }] },
      ],
    }),
  }
  const seen = []
  const llm = {
    listProviders: () => [{ id: 'p1' }],
    listModels: async () => [{ id: 'm1' }],
    async * stream(opts) {
      seen.push(opts)
      yield { type: 'text-delta', text: '增强正文' }
      yield { type: 'finish', reason: { kind: 'stop' } }
    },
  }
  const { ctx, routes } = makeCtx({ sessions, llm, agentDefaultModel: DEFAULT_MODEL })
  apply(ctx, {})
  const handler = routes['/api/prompt-enhance/enhance']
  const res = makeRes()
  await handler(makeReq({ sessionId: 's1', draft: '写登录接口', mode: 'standard' }), res)
  const payload = JSON.parse(res.body)
  assert.equal(payload.ok, true)
  const userText = seen[0].messages[0].content[0].text
  assert.ok(userText.includes('=== 会话历史上下文（最近 1 轮） ==='))
  assert.ok(userText.includes('就用 FastAPI'))
  // 诊断环记录 historyChars
  const logRes = makeRes()
  await routes['/api/prompt-enhance/log'](makeReq({}), logRes)
  const logs = JSON.parse(logRes.body).requests
  const rec = logs[logs.length - 1]
  assert.ok(rec.historyChars > 0)
})

// ---------- 路由门禁（加固） ----------
// 背景：这三条路由是 webServer 上的 exact 注册，而 DSH 的 /api 围栏是 prefix 路由
// （exact 命中即返回，围栏看不到它们）。实测 0.2.0-rc.2 上带 Origin/Sec-Fetch-Site
// 跨站头的 POST 能直接打到 enhance 路由，所以插件必须自己套宿主的门禁。

test('门禁：跨站请求被拒（回退门禁）', async () => {
  const { llm } = makeLlm({ streamChunks: [{ type: 'text-delta', text: 'x' }, { type: 'finish', reason: { kind: 'stop' } }] })
  const { ctx, routes } = makeCtx({ sessions: DEFAULT_SESSIONS, llm, agentDefaultModel: DEFAULT_MODEL })
  apply(ctx, {})
  const handler = routes['/api/prompt-enhance/enhance']

  const crossSite = makeRes()
  await handler(makeReq({ sessionId: 's1', draft: '写登录接口' }, {
    headers: { host: '127.0.0.1:19387', origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' },
  }), crossSite)
  assert.equal(crossSite.statusCode, 403)
  assert.equal(JSON.parse(crossSite.body).code, 'FORBIDDEN')

  // 诊断环同样要挡住（跨源页面不得读走 session/模型信息）
  const logCross = makeRes()
  await routes['/api/prompt-enhance/log'](makeReq({}, {
    method: 'GET',
    headers: { host: '127.0.0.1:19387', 'sec-fetch-site': 'cross-site' },
  }), logCross)
  assert.equal(logCross.statusCode, 403)
})

test('门禁：非同源 Origin / 非回环 Host 被拒，本机同源放行', async () => {
  const { llm } = makeLlm({ streamChunks: [{ type: 'text-delta', text: 'x' }, { type: 'finish', reason: { kind: 'stop' } }] })
  const { ctx, routes } = makeCtx({ sessions: DEFAULT_SESSIONS, llm, agentDefaultModel: DEFAULT_MODEL })
  apply(ctx, {})
  const handler = routes['/api/prompt-enhance/enhance']

  const badOrigin = makeRes()
  await handler(makeReq({ sessionId: 's1', draft: '写登录接口' }, {
    headers: { host: '127.0.0.1:19387', origin: 'http://127.0.0.1:9999' },
  }), badOrigin)
  assert.equal(badOrigin.statusCode, 403)

  const badHost = makeRes()
  await handler(makeReq({ sessionId: 's1', draft: '写登录接口' }, {
    headers: { host: 'evil.example:19387' },
  }), badHost)
  assert.equal(badHost.statusCode, 403)

  // 本机同源（浏览器同源 POST 的形状）放行
  const ok = makeRes()
  await handler(makeReq({ sessionId: 's1', draft: '写登录接口', mode: 'basic' }, {
    headers: { host: '127.0.0.1:19387', origin: 'http://127.0.0.1:19387', 'sec-fetch-site': 'same-origin' },
  }), ok)
  assert.equal(ok.statusCode, 200)
  assert.equal(JSON.parse(ok.body).ok, true)

  // 无 Host/Origin 的本机进程（curl/CGI）放行：不是 CSRF 载体
  const cli = makeRes()
  await handler(makeReq({ sessionId: 's1', draft: '写登录接口', mode: 'basic' }), cli)
  assert.equal(cli.statusCode, 200)
})

test('门禁：优先使用宿主 connection.requestRejection（含 401 与 fail-closed）', async () => {
  const { llm } = makeLlm({ streamChunks: [{ type: 'text-delta', text: 'x' }, { type: 'finish', reason: { kind: 'stop' } }] })
  const { ctx, routes } = makeCtx({ sessions: DEFAULT_SESSIONS, llm, agentDefaultModel: DEFAULT_MODEL })
  apply(ctx, {})

  // 宿主门禁返回 401（需要登录）
  ctx.get = (key) => (key === 'connection' ? { requestRejection: () => 401 } : ({
    sessions: DEFAULT_SESSIONS, fs: fakeFs, llm, agentDefaultModel: DEFAULT_MODEL,
  })[key])
  const res401 = makeRes()
  await routes['/api/prompt-enhance/enhance'](makeReq({ sessionId: 's1', draft: 'x' }), res401)
  assert.equal(res401.statusCode, 401)

  // 宿主门禁抛错 → 必须 fail closed
  ctx.get = (key) => (key === 'connection' ? { requestRejection: () => { throw new Error('boom') } } : ({
    sessions: DEFAULT_SESSIONS, fs: fakeFs, llm, agentDefaultModel: DEFAULT_MODEL,
  })[key])
  const resThrow = makeRes()
  await routes['/api/prompt-enhance/enhance'](makeReq({ sessionId: 's1', draft: 'x' }), resThrow)
  assert.equal(resThrow.statusCode, 403)

  // 宿主门禁放行（undefined）→ 正常处理
  ctx.get = (key) => (key === 'connection' ? { requestRejection: () => undefined } : ({
    sessions: DEFAULT_SESSIONS, fs: fakeFs, llm, agentDefaultModel: DEFAULT_MODEL,
  })[key])
  const resOk = makeRes()
  await routes['/api/prompt-enhance/enhance'](makeReq({ sessionId: 's1', draft: 'x', mode: 'basic' }), resOk)
  assert.equal(resOk.statusCode, 200)

  // 读接口不要求 cookie：宿主门禁拒绝时 /log 仍可被本机脚本读取，但跨站 Host/来源仍被挡
  const logOk = makeRes()
  await routes['/api/prompt-enhance/log'](makeReq({}, { method: 'GET', headers: { host: '127.0.0.1:19387' } }), logOk)
  assert.equal(logOk.statusCode, 200, '本机脚本应仍能读诊断环')
  const logRebind = makeRes()
  await routes['/api/prompt-enhance/log'](makeReq({}, { method: 'GET', headers: { host: 'evil.example:19387' } }), logRebind)
  assert.equal(logRebind.statusCode, 403, 'DNS rebinding 的 Host 必须被挡')
})

test('门禁：POST 带非 JSON content-type 返回 415（挡表单型跨站简单请求）', async () => {
  const { llm } = makeLlm({ streamChunks: [{ type: 'text-delta', text: 'x' }, { type: 'finish', reason: { kind: 'stop' } }] })
  const { ctx, routes } = makeCtx({ sessions: DEFAULT_SESSIONS, llm, agentDefaultModel: DEFAULT_MODEL })
  apply(ctx, {})
  const res = makeRes()
  await routes['/api/prompt-enhance/enhance'](makeReq('{"sessionId":"s1","draft":"x"}', {
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
  }), res)
  assert.equal(res.statusCode, 415)
  assert.equal(JSON.parse(res.body).code, 'BAD_BODY')
})

test('加固：超大请求体返回 413（不再直接断连）', async () => {
  const { ctx, routes } = makeCtx({ llm: makeLlm({}).llm })
  apply(ctx, {})
  const huge = 'x'.repeat(1_200_000)
  const res = makeRes()
  await routes['/api/prompt-enhance/enhance'](makeReq(huge), res)
  assert.equal(res.statusCode, 413)
  assert.ok(JSON.parse(res.body).message.includes('请求体过大'))
})

test('加固：超长草稿返回 BAD_BODY（限制单次远端调用成本）', async () => {
  const { ctx, routes } = makeCtx({ llm: makeLlm({}).llm })
  apply(ctx, {})
  const res = makeRes()
  await routes['/api/prompt-enhance/enhance'](makeReq({ sessionId: 's1', draft: 'y'.repeat(20_001) }), res)
  assert.equal(JSON.parse(res.body).code, 'BAD_BODY')
  assert.ok(JSON.parse(res.body).message.includes('草稿过长'))
})

test('加固：单条路由注册失败不影响其它两条', async () => {
  const { llm } = makeLlm({ streamChunks: [{ type: 'text-delta', text: 'ok' }, { type: 'finish', reason: { kind: 'stop' } }] })
  const routes = {}
  const ctx = {
    effect(fn) { const d = fn(); return () => { if (typeof d === 'function') d() } },
    get(key) {
      return ({ sessions: DEFAULT_SESSIONS, fs: fakeFs, llm, agentDefaultModel: DEFAULT_MODEL })[key]
    },
    webServer: {
      register(desc) {
        // 模拟 webServer 对重复 (kind,path) 直接 throw：只有该条应被放弃
        if (desc.path === '/api/prompt-enhance/log') throw new Error('webserver: duplicate exact route')
        routes[desc.path] = desc.handler
        return () => { delete routes[desc.path] }
      },
    },
  }
  apply(ctx, {})
  assert.ok(routes['/api/prompt-enhance/enhance'], 'enhance 仍应注册成功')
  assert.ok(routes['/api/prompt-enhance/log-error'], 'log-error 仍应注册成功')
  assert.equal(routes['/api/prompt-enhance/log'], undefined, '冲突的那条被放弃')
  const res = makeRes()
  await routes['/api/prompt-enhance/enhance'](makeReq({ sessionId: 's1', draft: 'x', mode: 'basic' }), res)
  assert.equal(JSON.parse(res.body).ok, true)
})

test('会话当前模型优先于全局默认模型（候选链首位）', async () => {
  const sessions = {
    get: () => ({
      header: { cwd: '/workspace/proj' },
      requestHeader: () => ({ config: { provider: 'session-provider', model: 'session-model' } }),
    }),
  }
  const seen = []
  const llm = {
    listProviders: () => [{ id: 'p1' }],
    listModels: async () => [{ id: 'm1' }],
    async * stream(opts) {
      seen.push(opts)
      yield { type: 'text-delta', text: 'x' }
      yield { type: 'finish', reason: { kind: 'stop' } }
    },
  }
  const { ctx, routes } = makeCtx({ sessions, llm, agentDefaultModel: { currentSelection: () => ({ provider: 'global-provider', model: 'global-model' }) } })
  apply(ctx, { autoFill: false })
  const res = makeRes()
  await routes['/api/prompt-enhance/enhance'](makeReq({ sessionId: 's1', draft: '写登录接口', mode: 'basic' }), res)
  const payload = JSON.parse(res.body)
  assert.equal(payload.ok, true)
  assert.equal(seen[0].provider, 'session-provider')
  assert.equal(seen[0].model, 'session-model')
})

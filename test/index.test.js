import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveConfig,
  collectContext,
  buildSystem,
  collectCandidates,
  reasonKind,
  reasonCode,
  reasonMessage,
  streamAttempt,
  attemptCandidate,
  splitConfirmations,
} from '../lib/index.js'

// ---------- resolveConfig ----------

test('resolveConfig 返回默认配置', () => {
  const cfg = resolveConfig(undefined)
  assert.equal(cfg.maxAttempts, 3)
  assert.deepEqual(cfg.candidates, [])
  assert.equal(cfg.autoFill, true)
  assert.equal(cfg.system, '')
  assert.ok(cfg.modes.basic)
  assert.ok(cfg.modes.standard)
  assert.ok(cfg.modes.expert)
  assert.equal(cfg.modes.basic.needsContext, false)
  assert.equal(cfg.modes.standard.needsContext, true)
})

test('resolveConfig 支持按模式覆盖与边界裁剪', () => {
  const cfg = resolveConfig({
    maxAttempts: 99,
    autoFill: false,
    system: '  自定义系统提示词  ',
    modes: {
      standard: { effort: 'none', maxTokens: 9999, depth: 5 },
    },
  })
  assert.equal(cfg.maxAttempts, 6)
  assert.equal(cfg.autoFill, false)
  assert.equal(cfg.system, '自定义系统提示词')
  assert.equal(cfg.modes.standard.effort, 'none')
  assert.equal(cfg.modes.standard.maxTokens, 9999)
  assert.equal(cfg.modes.standard.depth, 5)
  // 未覆盖的字段保持默认
  assert.equal(cfg.modes.standard.temperature, 0.3)
  assert.equal(cfg.modes.basic.effort, 'off')
})

test('resolveConfig 过滤非法候选并裁剪 maxAttempts 下限', () => {
  const cfg = resolveConfig({
    maxAttempts: 0,
    candidates: [{ provider: 'p', model: 'm' }, { provider: '' }, null, { model: 'x' }],
  })
  assert.equal(cfg.maxAttempts, 3)
  assert.deepEqual(cfg.candidates, [{ provider: 'p', model: 'm' }])
})

// ---------- reason 解析 ----------

test('reasonKind/reasonCode/reasonMessage 兼容对象与字符串', () => {
  assert.equal(reasonKind({ kind: 'max-tokens' }), 'max-tokens')
  assert.equal(reasonKind('error'), 'error')
  assert.equal(reasonKind(null), '')
  assert.equal(reasonKind(undefined), '')
  assert.equal(reasonCode({ failure: { code: 'EMPTY_LENGTH' } }), 'EMPTY_LENGTH')
  assert.equal(reasonCode({}), '')
  assert.equal(reasonMessage({ failure: { message: 'boom' } }), 'boom')
  assert.equal(reasonMessage({}), '')
})

// ---------- splitConfirmations ----------

test('splitConfirmations 剥离“── 待确认 ──”段', () => {
  const r = splitConfirmations('正文内容\n── 待确认 ──\n- 缺少目标\n- 缺少输出格式')
  assert.equal(r.text, '正文内容')
  assert.equal(r.confirmations, '- 缺少目标\n- 缺少输出格式')
})

test('splitConfirmations 支持“需要确认：”标记与无标记场景', () => {
  const r = splitConfirmations('正文\n需要确认：\n- 补全平台')
  assert.equal(r.text, '正文')
  assert.equal(r.confirmations, '- 补全平台')
  const n = splitConfirmations('没有标记的正文')
  assert.deepEqual(n, { text: '没有标记的正文', confirmations: '' })
  assert.deepEqual(splitConfirmations(''), { text: '', confirmations: '' })
})

// ---------- buildSystem ----------

test('buildSystem 组装默认提示词并支持整体替换', () => {
  const sys = buildSystem({ extra: '模式：专家。' }, { system: '' })
  assert.ok(sys.includes('资深提示词工程师'))
  assert.ok(sys.includes('模式：专家。'))
  assert.equal(buildSystem({ extra: '' }, { system: '完全自定义' }), '完全自定义')
})

// ---------- collectCandidates ----------

function makeLlmForCandidates() {
  return {
    listProviders: () => [{ id: 'p1' }, { id: 'p2' }],
    listModels: async (id) => (id === 'p1' ? [{ id: 'm1' }, { id: 'm2' }] : Promise.reject(new Error('枚举失败'))),
  }
}

test('collectCandidates：固定候选优先、自动补足并去重', async () => {
  const llm = makeLlmForCandidates()
  const list = await collectCandidates(
    llm,
    { currentSelection: () => ({ provider: 'p1', model: 'm1' }) },
    { candidates: [{ provider: 'p0', model: 'default' }], autoFill: true, maxAttempts: 4 },
  )
  assert.equal(list.length, 3) // p0/default + p1/m1 + p1/m2；p2 枚举失败被吞掉，p1/m1 已去重
  assert.deepEqual(list[0], { provider: 'p0', model: 'default' })
  assert.deepEqual(list[1], { provider: 'p1', model: 'm1' })
  assert.deepEqual(list[2], { provider: 'p1', model: 'm2' })
})

test('collectCandidates：autoFill=false 时只用固定候选并受上限截断', async () => {
  const llm = makeLlmForCandidates()
  const list = await collectCandidates(
    llm,
    { currentSelection: () => ({ provider: 'p1', model: 'm1' }) },
    { candidates: [{ provider: 'p0', model: 'default' }], autoFill: false, maxAttempts: 1 },
  )
  assert.deepEqual(list, [{ provider: 'p0', model: 'default' }])
})

// ---------- streamAttempt ----------

function makeLlm(results) {
  let calls = 0
  const llm = {
    async * stream() {
      calls++
      const r = results[calls - 1]
      if (r instanceof Error) throw r
      if (r) yield* r
    },
  }
  return { llm, calls: () => calls }
}

const CAND = { provider: 'p', model: 'm' }

test('streamAttempt：正常流式输出', async () => {
  const { llm } = makeLlm([[{ type: 'text-delta', text: '  你好 ' }, { type: 'finish', reason: { kind: 'stop' } }]])
  const r = await streamAttempt(llm, CAND, 'sys', 'user', { temperature: 0.3, maxTokens: 1000 }, 'high')
  assert.equal(r.text, '你好')
})

test('streamAttempt：error finish 与抛异常', async () => {
  const { llm } = makeLlm([[{ type: 'finish', reason: { kind: 'error', failure: { code: 'E1', message: 'nope' } } }]])
  const r = await streamAttempt(llm, CAND, 's', 'u', { temperature: 0, maxTokens: 10 }, undefined)
  assert.deepEqual(r, { failed: 'nope', code: 'E1' })

  const { llm: llm2 } = makeLlm([new Error('boom')])
  const r2 = await streamAttempt(llm2, CAND, 's', 'u', { temperature: 0, maxTokens: 10 }, undefined)
  assert.equal(r2.failed, 'boom')
})

test('streamAttempt：空输出按 max-tokens 判定预算耗尽', async () => {
  const { llm } = makeLlm([[{ type: 'finish', reason: { kind: 'max-tokens' } }]])
  const r = await streamAttempt(llm, CAND, 's', 'u', { temperature: 0, maxTokens: 10 }, 'high')
  assert.equal(r.code, 'EMPTY_LENGTH')
  assert.equal(r.failed, '空输出（输出预算耗尽）')
})

test('streamAttempt：取消信号立即返回 canceled', async () => {
  const { llm } = makeLlm([[{ type: 'text-delta', text: 'x' }]])
  const ctrl = new AbortController()
  ctrl.abort()
  const r = await streamAttempt(llm, CAND, 's', 'u', { temperature: 0, maxTokens: 10 }, 'high', ctrl.signal)
  assert.equal(r.canceled, true)
})

// ---------- attemptCandidate ----------

test('attemptCandidate：首次调用成功', async () => {
  const { llm, calls } = makeLlm([[{ type: 'text-delta', text: 'ok' }, { type: 'finish', reason: { kind: 'stop' } }]])
  const r = await attemptCandidate(llm, CAND, 's', 'u', { effort: 'high', temperature: 0, maxTokens: 10 })
  assert.equal(r.text, 'ok')
  assert.equal(calls(), 1)
})

test('attemptCandidate：档位被拒后去档位重试成功', async () => {
  const { llm, calls } = makeLlm([
    new Error('400: developer role not supported'),
    [{ type: 'text-delta', text: 'fallback' }, { type: 'finish', reason: { kind: 'stop' } }],
  ])
  const r = await attemptCandidate(llm, CAND, 's', 'u', { effort: 'high', temperature: 0, maxTokens: 10 })
  assert.equal(r.text, 'fallback')
  assert.equal(calls(), 2)
})

test('attemptCandidate：预算耗尽时关推理加大预算重试', async () => {
  const empty = { type: 'finish', reason: { kind: 'max-tokens' } }
  const { llm, calls } = makeLlm([
    [empty],
    [{ type: 'text-delta', text: 'bigger' }, { type: 'finish', reason: { kind: 'stop' } }],
  ])
  const r = await attemptCandidate(llm, CAND, 's', 'u', { effort: 'high', temperature: 0, maxTokens: 1000 })
  assert.equal(r.text, 'bigger')
  assert.equal(calls(), 2)
})

test('attemptCandidate：全部失败返回失败原因', async () => {
  const { llm } = makeLlm([new Error('第一次失败'), new Error('第二次失败')])
  const r = await attemptCandidate(llm, CAND, 's', 'u', { effort: 'high', temperature: 0, maxTokens: 10 })
  assert.ok(!r.text)
  assert.ok(r.failed.includes('带档位(high)'))
  assert.ok(r.failed.includes('无档位重试'))
})

// ---------- collectContext ----------

const fakeFs = {
  async resolve(p) { return p === '.' ? '/workspace' : p },
  async stat() { return { type: 'directory' } },
  async listDir(p) {
    if (p === '/workspace/proj') {
      return [
        { name: 'package.json', type: 'file', size: 50 },
        { name: 'src', type: 'directory' },
      ]
    }
    return []
  },
  async readText() { return '{"name":"demo"}' },
}

const CTX_CFG = { depth: 2, treeLines: 160, treeChars: 7000, fileChars: 6000, contentChars: 11000 }

test('collectContext：正常采集并包含配置/入口文件', async () => {
  const out = await collectContext(fakeFs, '/workspace/proj', CTX_CFG)
  assert.ok(out.includes('项目根目录：/workspace/proj'))
  assert.ok(out.includes('package.json'))
  assert.ok(out.includes('配置文件'))
  assert.ok(out.includes('{"name":"demo"}'))
})

test('collectContext：拒绝工作区之外的目录（路径遍历防护）', async () => {
  await assert.rejects(
    collectContext(fakeFs, '/workspace-else', CTX_CFG),
    /Access denied: cwd outside workspace root/,
  )
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveConfig,
  collectContext,
  collectHistory,
  buildSystem,
  normalizeAnswers,
  buildReviseSystem,
  buildReviseUser,
  buildUserMessage,
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
  // 规则 4：能自答的别问，只问必须用户决定的
  assert.ok(sys.includes('能从项目上下文'))
  assert.ok(sys.includes('── 待确认 ──'))
  assert.equal(buildSystem({ extra: '' }, { system: '完全自定义' }), '完全自定义')
})

// ---------- 待确认问答闭环 ----------

test('normalizeAnswers 过滤空项并兼容多种键名', () => {
  assert.deepEqual(normalizeAnswers(undefined), [])
  assert.deepEqual(normalizeAnswers('x'), [])
  assert.deepEqual(
    normalizeAnswers([
      { question: '目标读者？', answer: '开发者' },
      { q: '平台？', a: 'Windows' },
      { text: '  空格问题  ', value: '  答案  ' },
      { question: '空回答', answer: '   ' },
      { question: '   ', answer: 'x' },
      null,
    ]),
    [
      { question: '目标读者？', answer: '开发者' },
      { question: '平台？', answer: 'Windows' },
      { question: '空格问题', answer: '答案' },
    ],
  )
})

test('normalizeAnswers 限制条数与长度', () => {
  const raw = Array.from({ length: 30 }, (_, i) => ({ question: 'q'.repeat(600) + i, answer: 'a'.repeat(2500) + i }))
  const out = normalizeAnswers(raw)
  assert.equal(out.length, 20)
  assert.ok(out[0].question.length <= 500)
  assert.ok(out[0].answer.length <= 2000)
})

test('buildReviseSystem 输出修订规则并尊重 system 覆盖', () => {
  const sys = buildReviseSystem({ extra: '模式：标准。' }, { system: '' })
  assert.ok(sys.includes('修订一份已有的增强提示词'))
  assert.ok(sys.includes('模式：标准。'))
  const over = buildReviseSystem({ extra: '' }, { system: '自定义系统' })
  assert.ok(over.startsWith('自定义系统'))
  assert.ok(over.includes('修订一份已有的增强提示词'))
})

test('buildReviseUser 携带原始提示词、回答与上一版正文', () => {
  const user = buildReviseUser('写一个登录接口', '增强正文v1', [
    { question: '用什么框架？', answer: 'FastAPI' },
    { question: '部署到哪？', answer: 'Docker' },
  ])
  assert.ok(user.includes('原始提示词：\n写一个登录接口'))
  assert.ok(user.includes('1. 问题：用什么框架？\n   确认：FastAPI'))
  assert.ok(user.includes('2. 问题：部署到哪？\n   确认：Docker'))
  assert.ok(user.includes('上一版增强正文（待修订）：\n增强正文v1'))
  assert.ok(user.includes('直接输出修订后的完整增强正文'))
})

test('buildUserMessage：无回答保持原格式，有回答走修订或补充信息', () => {
  const mode = { needsContext: true }
  assert.equal(
    buildUserMessage(mode, 'CTX', '草稿', [], ''),
    '项目上下文：\nCTX\n\n原始提示词：\n草稿\n\n请基于项目上下文重写并增强上面的原始提示词，直接输出增强结果。',
  )
  const revise = buildUserMessage(mode, 'CTX', '草稿', [{ question: 'Q', answer: 'A' }], 'v1正文')
  assert.ok(revise.includes('上一版增强正文（待修订）：\nv1正文'))
  const fresh = buildUserMessage(mode, 'CTX', '草稿', [{ question: 'Q', answer: 'A' }], '')
  assert.ok(fresh.includes('用户确认的信息：'))
  assert.ok(fresh.includes('1. Q → A'))
  assert.ok(fresh.includes('请基于以上项目上下文与用户确认的信息重写并增强'))
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

// 与真实 DSH fs 服务（dsh-fs-local）保持一致：resolve() 返回 { targetKey, displayPath }
// 目标对象，listDir/stat 接收目标对象。早期桩返回纯字符串，掩盖了“把对象当字符串用”
// 的回归（workspaceRoot.replace 抛 TypeError → 标准/专家模式拿不到项目上下文）。
const fakeFs = {
  async resolve(p) {
    // fs 服务根固定为 '/workspace'（模拟 dsh 启动目录），会话 cwd 可以是任意项目
    const key = p === '.' ? '/workspace' : p
    return { targetKey: key, displayPath: key }
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
    if (p === '/teammate/other-proj') {
      return [
        { name: 'README.md', type: 'file', size: 20, target: { targetKey: '/teammate/other-proj/README.md', displayPath: '/teammate/other-proj/README.md' } },
        { name: 'app.py', type: 'file', size: 40, target: { targetKey: '/teammate/other-proj/app.py', displayPath: '/teammate/other-proj/app.py' } },
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

test('collectContext：会话 cwd 在 fs 服务根之外也能采集（多工作区）', async () => {
  // fs 服务根是 '/workspace'（dsh 启动目录），会话 cwd 在另一个项目
  // '/teammate/other-proj'：不应被当作越权拒绝，否则标准/专家模式报
  // “未能读取到项目上下文”。
  const out = await collectContext(fakeFs, '/teammate/other-proj', CTX_CFG)
  assert.ok(out.includes('项目根目录：/teammate/other-proj'))
  assert.ok(out.includes('README.md'))
  assert.ok(out.includes('app.py'))
})

// ---------- collectHistory ----------

function fakeSession(msgs) {
  return { deriveMessages: () => msgs }
}

const HIST_CFG = { historyTurns: 3, historyChars: 6000 }

test('collectHistory：不可用场景静默返回空串', () => {
  assert.equal(collectHistory(null, HIST_CFG), '')
  assert.equal(collectHistory({}, HIST_CFG), '')
  assert.equal(collectHistory({ deriveMessages: () => 'nope' }, HIST_CFG), '')
  assert.equal(collectHistory({ deriveMessages: () => { throw new Error('boom') } }, HIST_CFG), '')
  assert.equal(collectHistory(fakeSession([]), HIST_CFG), '')
  assert.equal(collectHistory(fakeSession([]), { historyTurns: 0, historyChars: 6000 }), '')
})

test('collectHistory：过滤工具/插件/推理块并配对问题与结论', () => {
  const msgs = [
    { role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '实现用户注册' }] },
    { role: 'assistant', source: { kind: 'tool' }, content: [{ type: 'tool-call', id: 't1' }] },
    { role: 'user', source: { kind: 'tool' }, content: [{ type: 'tool-result', toolCallId: 't1', text: '/src/a.ts 文件内容' }] },
    { role: 'assistant', source: { kind: 'model' }, content: [{ type: 'reasoning', text: '深层思考' }, { type: 'text', text: '用 FastAPI 实现，参考 src/api.py' }] },
    { role: 'user', source: { kind: 'plugin' }, content: [{ type: 'text', text: '注入的指令' }] },
  ]
  const out = collectHistory(fakeSession(msgs), HIST_CFG)
  assert.ok(out.startsWith('=== 会话历史上下文（最近 1 轮） ==='))
  assert.ok(out.includes('用户：实现用户注册'))
  assert.ok(out.includes('助手结论：用 FastAPI 实现'))
  assert.ok(!out.includes('tool-call'))
  assert.ok(!out.includes('src/a.ts'))
  assert.ok(!out.includes('注入的指令'))
  assert.ok(!out.includes('深层思考'))
})

test('collectHistory：窗口只保留最近 N 轮', () => {
  const mkQ = (i) => ({ role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '问' + i }] })
  const mkA = (i) => ({ role: 'assistant', source: { kind: 'model' }, content: [{ type: 'text', text: '答' + i }] })
  const msgs = []
  for (let i = 1; i <= 5; i++) msgs.push(mkQ(i), mkA(i))
  const out = collectHistory(fakeSession(msgs), { historyTurns: 2, historyChars: 6000 })
  assert.ok(out.includes('最近 2 轮'))
  assert.ok(!out.includes('用户：问1'))
  assert.ok(out.includes('用户：问4'))
  assert.ok(out.includes('用户：问5'))
})

test('collectHistory：助手结论尾部截断并标记', () => {
  const longA = 'x'.repeat(1000)
  const msgs = [
    { role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '问题' }] },
    { role: 'assistant', source: { kind: 'model' }, content: [{ type: 'text', text: longA }] },
  ]
  const out = collectHistory(fakeSession(msgs), HIST_CFG)
  assert.ok(out.includes('…[历史截断]'))
  assert.ok(out.trimEnd().endsWith('x'))
  assert.ok(out.length < 900)
})

test('collectHistory：字符顶从最旧一轮开始丢弃', () => {
  const mkQ = (i) => ({ role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '问' + i + 'y'.repeat(30) }] })
  const mkA = (i) => ({ role: 'assistant', source: { kind: 'model' }, content: [{ type: 'text', text: '答' + i + 'z'.repeat(30) }] })
  const msgs = []
  for (let i = 1; i <= 3; i++) msgs.push(mkQ(i), mkA(i))
  const out = collectHistory(fakeSession(msgs), { historyTurns: 3, historyChars: 120 })
  assert.ok(out.includes('最近 1 轮'))
  assert.ok(!out.includes('用户：问1'))
  assert.ok(!out.includes('用户：问2'))
  assert.ok(out.includes('用户：问3'))
})

// ---------- 会话历史接入 ----------

test('resolveConfig：history 默认值与 ≥0 裁剪', () => {
  const cfg = resolveConfig(undefined)
  assert.equal(cfg.modes.basic.historyTurns, 0)
  assert.equal(cfg.modes.basic.historyChars, 0)
  assert.equal(cfg.modes.standard.historyTurns, 3)
  assert.equal(cfg.modes.standard.historyChars, 6000)
  assert.equal(cfg.modes.expert.historyTurns, 3)
  assert.equal(cfg.modes.expert.historyChars, 9000)
  const over = resolveConfig({ modes: { standard: { historyTurns: -2, historyChars: 0 } } })
  assert.equal(over.modes.standard.historyTurns, 0)
  assert.equal(over.modes.standard.historyChars, 0)
})

test('buildUserMessage：会话历史段插在项目上下文之前', () => {
  const mode = { needsContext: true }
  const hist = '=== 会话历史上下文（最近 2 轮） ===\n用户：A\n助手结论：B'
  const out = buildUserMessage(mode, 'CTX', '草稿', [], '', hist)
  assert.ok(out.startsWith('=== 会话历史上下文'))
  assert.ok(out.includes('项目上下文：\nCTX'))
  assert.ok(out.includes('原始提示词：\n草稿'))
  // 无历史时格式不变
  assert.equal(
    buildUserMessage(mode, 'CTX', '草稿', [], ''),
    '项目上下文：\nCTX\n\n原始提示词：\n草稿\n\n请基于项目上下文重写并增强上面的原始提示词，直接输出增强结果。',
  )
  // 修订轮次同样携带历史
  const revise = buildReviseUser('草稿', 'v1', [{ question: 'Q', answer: 'A' }], hist)
  assert.ok(revise.startsWith('会话历史上下文：'))
  assert.ok(revise.includes('原始提示词：\n草稿'))
})

// ---------- 智能项目上下文 ----------

test('collectContext：草稿关键词命中文件优先读取', async () => {
  const calls = []
  const fs2 = {
    async resolve(p) { return { targetKey: p, displayPath: p } },
    async stat() { return { type: 'directory' } },
    async listDir(t) {
      const p = typeof t === 'string' ? t : t.targetKey
      if (p === '/workspace/proj') {
        return [
          { name: 'main.py', type: 'file', size: 100, target: { targetKey: '/workspace/proj/main.py', displayPath: '/workspace/proj/main.py' } },
          { name: 'app.py', type: 'file', size: 100, target: { targetKey: '/workspace/proj/app.py', displayPath: '/workspace/proj/app.py' } },
        ]
      }
      return []
    },
    async readText(t) { calls.push(typeof t === 'string' ? t : t.targetKey); return 'CODE' },
  }
  const cfg = { depth: 2, treeLines: 160, treeChars: 7000, fileChars: 6000, contentChars: 200 }
  const out = await collectContext(fs2, '/workspace/proj', cfg, '给 main 入口加登录')
  assert.deepEqual(calls, ['/workspace/proj/main.py', '/workspace/proj/app.py'])
  assert.ok(out.includes('入口文件: main.py'))
  assert.ok(out.includes('入口文件: app.py'))
})

test('collectContext：AGENTS.md 作为项目事实文件优先读取', async () => {
  const fs3 = {
    async resolve(p) { return { targetKey: p, displayPath: p } },
    async stat() { return { type: 'directory' } },
    async listDir(t) {
      const p = typeof t === 'string' ? t : t.targetKey
      if (p === '/workspace/proj') {
        return [
          { name: 'AGENTS.md', type: 'file', size: 500, target: { targetKey: '/workspace/proj/AGENTS.md', displayPath: '/workspace/proj/AGENTS.md' } },
          { name: 'package.json', type: 'file', size: 50, target: { targetKey: '/workspace/proj/package.json', displayPath: '/workspace/proj/package.json' } },
        ]
      }
      return []
    },
    async readText(t) {
      const p = typeof t === 'string' ? t : t.targetKey
      return p.endsWith('AGENTS.md') ? '项目事实：技术栈 FastAPI' : '{"name":"demo"}'
    },
  }
  const out = await collectContext(fs3, '/workspace/proj', CTX_CFG, '')
  const ai = out.indexOf('项目事实文件: AGENTS.md')
  const pi = out.indexOf('配置文件: package.json')
  assert.ok(ai >= 0 && pi > ai)
  assert.ok(out.includes('技术栈 FastAPI'))
})

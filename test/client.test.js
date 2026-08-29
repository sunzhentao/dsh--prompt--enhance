// client.js 是浏览器 module-loader bundle（window.__ModuleLoader__.load），
// Node 无法直接 import 执行。这里 stub 掉 window.__ModuleLoader__ 捕获 factory，
// 用 fake react 手动执行 factory 拿到 module.exports（不调用 apply，避免 DOM 依赖）。
import { test } from 'node:test'
import assert from 'node:assert/strict'

const fakeReact = {
  createElement: () => ({}),
  useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
  useEffect: () => {},
  useRef: () => ({ current: null }),
  Fragment: {},
}

let captured = null
globalThis.window = {
  __ModuleLoader__: { load: (opts) => { captured = opts.factory } },
}

const _mod = await import('../lib/client.js')
const mod = captured((id) => (id === 'react' ? fakeReact : undefined))

test('parseConfirmations：支持 -/*/•/数字列表项', () => {
  const items = mod.parseConfirmations('- 目标读者是谁？\n* 部署目标？\n1. 验收标准？')
  assert.deepEqual(items, [
    { question: '目标读者是谁？' },
    { question: '部署目标？' },
    { question: '验收标准？' },
  ])
})

test('parseConfirmations：非列表行并入上一项续行', () => {
  const items = mod.parseConfirmations('- 目标读者是谁？\n  例如产品经理或开发者\n- 部署目标？')
  assert.equal(items.length, 2)
  assert.equal(items[0].question, '目标读者是谁？\n例如产品经理或开发者')
  assert.equal(items[1].question, '部署目标？')
})

test('parseConfirmations：无列表标记整体一条；空输入返回空数组', () => {
  assert.deepEqual(mod.parseConfirmations('目标读者是谁？'), [{ question: '目标读者是谁？' }])
  assert.deepEqual(mod.parseConfirmations('   '), [])
  assert.deepEqual(mod.parseConfirmations(null), [])
  assert.deepEqual(mod.parseConfirmations(''), [])
})

test('parseConfirmations：过滤空问题列表项', () => {
  assert.deepEqual(mod.parseConfirmations('- 有效问题\n- \n- 另一个问题'), [
    { question: '有效问题' },
    { question: '另一个问题' },
  ])
})

test('friendlyError：已知码映射、未知码回退、默认兜底', () => {
  assert.equal(mod.friendlyError('EMPTY_DRAFT'), '输入框为空，请先输入要增强的提示词。')
  assert.equal(mod.friendlyError('CANCELED'), '已取消增强。')
  assert.equal(mod.friendlyError('UNKNOWN_CODE', '自定义兜底'), '自定义兜底')
  assert.equal(mod.friendlyError('UNKNOWN_CODE'), '提示词增强失败，已保留原始输入。')
  assert.equal(mod.friendlyError(undefined, null), '提示词增强失败，已保留原始输入。')
})

test('ERR_HINTS：覆盖 Host 全部错误码', () => {
  const codes = ['BAD_BODY', 'EMPTY_DRAFT', 'FS_UNAVAILABLE', 'NO_CWD', 'NO_CONTEXT', 'LLM_UNAVAILABLE', 'NO_CANDIDATES', 'ALL_MODELS_FAILED', 'EMPTY_OUTPUT', 'CANCELED', 'INTERNAL']
  for (const c of codes) {
    assert.ok(mod.ERR_HINTS[c], 'missing friendly hint for ' + c)
    assert.ok(typeof mod.ERR_HINTS[c] === 'string' && mod.ERR_HINTS[c].length > 0)
  }
})

test('MODES：三种模式齐全且 id 唯一', () => {
  assert.deepEqual(mod.MODES.map((m) => m.id), ['basic', 'standard', 'expert'])
})

test('增强历史：push/list/clear 基础行为', () => {
  mod.clearHistory()
  assert.equal(mod.pushHistory({ ts: 1, mode: 'basic', original: 'o1', enhanced: 'e1', confirmations: '' }), 1)
  assert.deepEqual(mod.listHistory(), [{ ts: 1, mode: 'basic', original: 'o1', enhanced: 'e1', confirmations: '' }])
  assert.equal(mod.pushHistory({ ts: 2, mode: 'expert', original: 'o2', enhanced: 'e2', confirmations: 'q' }), 2)
  // 新 → 旧，#1 为最新
  assert.deepEqual(mod.listHistory()[0], { ts: 2, mode: 'expert', original: 'o2', enhanced: 'e2', confirmations: 'q' })
  mod.clearHistory()
  assert.deepEqual(mod.listHistory(), [])
})

test('增强历史：上限 20 条，超出丢弃最旧', () => {
  mod.clearHistory()
  for (let i = 1; i <= 22; i++) {
    mod.pushHistory({ ts: i, mode: 'basic', original: 'o' + i, enhanced: 'e' + i, confirmations: '' })
  }
  const list = mod.listHistory()
  assert.equal(list.length, 20)
  assert.equal(list[0].ts, 22, '最新在最前')
  assert.equal(list[19].ts, 3, '最旧的 1、2 被丢弃')
  mod.clearHistory()
})

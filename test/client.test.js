// client.js 是浏览器 module-loader bundle（window.__ModuleLoader__.load），
// Node 无法直接 import 执行。这里 stub 掉 window.__ModuleLoader__ 捕获 factory，
// 用 fake react 手动执行 factory 拿到 module.exports。
// fake react 带一个迷你 hooks 运行时：槽位组件可以真的渲染，状态跨渲染保留、
// effect 同步执行（够用来回归「按钮可用性」与「提示框自动消失」两条宿主契约）。
import { test } from 'node:test'
import assert from 'node:assert/strict'

// 当前渲染实例的 hooks 槽（React 的每实例状态），由 renderSlot 切换
let activeHooks = null
let hookIndex = 0

const fakeReact = {
  createElement: (type, props, ...children) => ({ type, props: { ...(props || {}), children } }),
  Fragment: 'Fragment',
  useState: (init) => {
    const hooks = activeHooks
    const i = hookIndex++
    if (!(i in hooks)) hooks[i] = typeof init === 'function' ? init() : init
    return [hooks[i], (next) => { hooks[i] = typeof next === 'function' ? next(hooks[i]) : next }]
  },
  useRef: (init) => {
    const hooks = activeHooks
    const i = hookIndex++
    if (!(i in hooks)) hooks[i] = { current: init === undefined ? null : init }
    return hooks[i]
  },
  useEffect: (fn, deps) => {
    const hooks = activeHooks
    const i = hookIndex++
    const prev = hooks[i]
    const changed = !prev || !deps || !prev.deps ||
      deps.length !== prev.deps.length || deps.some((d, k) => d !== prev.deps[k])
    if (!changed) return
    if (prev && prev.cleanup) prev.cleanup()
    hooks[i] = { deps, cleanup: fn() || undefined }
  },
}

let captured = null
globalThis.window = {
  __ModuleLoader__: { load: (opts) => { captured = opts.factory } },
  addEventListener: () => {},
  removeEventListener: () => {},
}
globalThis.document = {
  createElement: () => ({ setAttribute: () => {}, remove: () => {}, parentNode: null }),
  head: { appendChild: () => {} },
  addEventListener: () => {},
  removeEventListener: () => {},
}

const _mod = await import('../lib/client.js')
const mod = captured((id) => (id === 'react' ? fakeReact : undefined))

/** 建一个槽位组件实例（hooks 跨多次渲染保留）。 */
const slotInstance = (render) => {
  const instance = { hooks: [], render }
  return (props) => {
    activeHooks = instance.hooks
    hookIndex = 0
    return instance.render(props)
  }
}

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

// ---- 宿主契约回归：DSH 0.1.2-rc.1 起输入态走 useInput 钩子，owner props 为空 ----

test('readInputState：0.2.x 走 useInput 标准钩子', () => {
  const state = { phase: 'plain', draft: '你好' }
  let received = null
  const props = {
    useInput: (select) => { received = select; return select(state) },
    inputActions: { setDraft: () => {} },
    sessionId: 's1',
  }
  assert.deepEqual(mod.readInputState(props), state)
  assert.equal(typeof received, 'function', '应以选择器函数调用 useInput')
})

test('readInputState：≤0.1.1 回退 owner prop input', () => {
  const state = { phase: 'plain', draft: '旧契约' }
  assert.deepEqual(mod.readInputState({ input: state }), state)
  assert.equal(mod.readInputState(undefined), undefined)
  assert.equal(mod.readInputState({}), undefined)
})

/** 记录注册进各槽位的渲染函数的 fake ctx。 */
function fakeCtx () {
  const slots = new Map()
  const ctx = {
    effect: (fn) => { const d = fn(); return typeof d === 'function' ? d : () => {} },
    get: () => undefined, // 静态插件 ctx 里没有 timer 服务（本机实测）
    slots: {
      inject: (name, register) => { register() },
      register: (desc, render) => { slots.set(desc.name, render) },
    },
  }
  return { ctx, slots }
}

/** 遍历 createElement 产物，找出符合 predicate 的节点。 */
function findAll (node, predicate, out = []) {
  if (node === null || node === undefined || typeof node !== 'object') return out
  if (Array.isArray(node)) { for (const n of node) findAll(n, predicate, out); return out }
  if (predicate(node)) out.push(node)
  findAll(node.props ? node.props.children : undefined, predicate, out)
  return out
}

/** 0.2.x 契约的右槽 props：owner props 为空，输入态走 useInput 选择器钩子。 */
const inputProps = (state) => ({
  sessionId: 's1',
  inputActions: { setDraft: () => {} },
  useInput: (select) => select({ phase: 'plain', draft: '', ...state }),
})

/** ✦ 增强按钮（aria-label 以「提示词增强」开头，模式按钮是另一个）。 */
const starButton = (tree) =>
  findAll(tree, (n) => n.props && typeof n.props['aria-label'] === 'string' && n.props['aria-label'].startsWith('提示词增强')).pop()

test('右槽：宿主只给 useInput 时 ✦ 按钮可用，并可用草稿镜像发起增强', async () => {
  const { ctx, slots } = fakeCtx()
  mod.apply(ctx)
  const right = slotInstance(slots.get('conversation.input.right'))
  assert.ok(right, '右槽未注册')

  const calls = []
  globalThis.fetch = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) })
    return { json: async () => ({ ok: true, enhanced: '增强后', confirmations: '' }) }
  }
  try {
    const tree = right(inputProps({ draft: '原始提示词' }))
    const star = starButton(tree)
    assert.ok(star, '未渲染 ✦ 按钮')
    assert.equal(star.props.disabled, false, '有草稿时应可点击')

    await star.props.onClick()
    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, '/api/prompt-enhance/enhance')
    assert.deepEqual(calls[0].body, { sessionId: 's1', draft: '原始提示词', mode: 'standard' })
  } finally {
    delete globalThis.fetch
  }
})

test('右槽：空草稿 / 非 plain 输入态下 ✦ 按钮禁用', () => {
  const { ctx, slots } = fakeCtx()
  mod.apply(ctx)
  const right = slotInstance(slots.get('conversation.input.right'))
  assert.equal(starButton(right(inputProps({ draft: '   ' }))).props.disabled, true, '空白草稿')
  assert.equal(starButton(right(inputProps({ draft: 'x', phase: 'submitting' }))).props.disabled, true, '提交中')
})

test('右槽：≤0.1.1 的 owner prop input 仍可用', () => {
  const { ctx, slots } = fakeCtx()
  mod.apply(ctx)
  const right = slotInstance(slots.get('conversation.input.right'))
  const tree = right({ sessionId: 's1', inputActions: { setDraft: () => {} }, input: { phase: 'plain', draft: '旧宿主' } })
  assert.equal(starButton(tree).props.disabled, false)
})

test('overlay：ctx 取不到 timer 服务时，切换模式的提示框仍会自动消失', () => {
  const realSetTimeout = globalThis.setTimeout
  const pending = []
  globalThis.setTimeout = (fn, ms) => { pending.push({ fn, ms }); return pending.length }
  globalThis.clearTimeout = () => {}
  const { ctx, slots } = fakeCtx() // ctx.get('timer') → undefined（0.1.x 客户端就是这样）
  try {
    mod.apply(ctx)
    const right = slotInstance(slots.get('conversation.input.right'))
    const overlay = slotInstance(slots.get('conversation.input.overlay'))
    assert.equal(overlay({ sessionId: 's1' }), null, '初始无提示框')

    const openMenu = right(inputProps({ draft: 'x' }))
    findAll(openMenu, (n) => n.props && n.props['aria-label'] === '选择提示词增强模式').pop().props.onClick()
    const menu = right(inputProps({ draft: 'x' }))
    findAll(menu, (n) => n.props && n.props.role === 'menuitem')[0].props.onClick() // 切换模式 → 提示框

    assert.ok(overlay({ sessionId: 's1' }), '切换模式后应出现提示框')
    assert.equal(pending.length, 1, '提示框必须挂上自动消失定时器')
    assert.equal(pending[0].ms, 3600)

    pending[0].fn() // 定时器到点
    assert.equal(overlay({ sessionId: 's1' }), null, '提示框应已消失')
  } finally {
    globalThis.setTimeout = realSetTimeout
    delete globalThis.clearTimeout
  }
})

test('overlay：提示框可点击关闭（完全不依赖定时器）', () => {
  const realSetTimeout = globalThis.setTimeout
  globalThis.setTimeout = () => 0
  globalThis.clearTimeout = () => {}
  const { ctx, slots } = fakeCtx()
  try {
    mod.apply(ctx)
    const right = slotInstance(slots.get('conversation.input.right'))
    const overlay = slotInstance(slots.get('conversation.input.overlay'))
    starButton(right(inputProps({ draft: '   ' }))).props.onClick() // 空草稿 → 错误提示
    const notice = overlay({ sessionId: 's1' })
    assert.ok(notice, '应有提示框')
    assert.equal(notice.props.title, '点击关闭')
    notice.props.onClick()
    assert.equal(overlay({ sessionId: 's1' }), null, '点击后应立刻消失')
  } finally {
    globalThis.setTimeout = realSetTimeout
    delete globalThis.clearTimeout
  }
})

// prompt-enhance — Host half (static profile plugin).
// Serves POST /api/prompt-enhance/enhance: reads the caller's session cwd,
// collects a bounded project context (tree + key config/entry files), then
// asks the session's default LLM to rewrite the draft into an enhanced prompt.
//
// v1.1.0: 多模式（基础/标准/专家）、模型回退链（最多 3 次）、改写规则强化
// （语言与语气跟随草稿、代码/路径逐字保留、信息不足时列出待确认项）。
// Plain ESM, no build step. Mounted by the web profile composition.

const name = 'prompt-enhance'

const inject = ['webServer']

const SKIP_DIRS = new Set([
  '.git', '.hg', '.svn', 'node_modules', '.venv', 'venv', 'env', '__pycache__',
  '.pytest_cache', '.mypy_cache', '.ruff_cache', '.tox', '.idea', '.vscode',
  '.kilo', 'dist', 'build', 'out', 'target', 'coverage', 'htmlcov', '.next',
  '.nuxt', '.cache', '.eggs', 'logs', 'tmp', '.turbo', '.yarn', '.pnpm-store',
])
const CONFIG_NAME = /^(package\.json|pyproject\.toml|requirements.*\.txt|requirements.*\.in|Cargo\.toml|go\.mod|go\.sum|pom\.xml|build\.gradle(\.kts)?|composer\.json|Gemfile|Dockerfile|docker-compose\.ya?ml|\.env\.example|\.npmrc|\.python-version|tsconfig\.json|vite\.config\.(js|ts|mjs|mts)|Makefile|build\.ps1|deploy\.sh)$/i
const ENTRY_NAME = /^(main\.py|__main__\.py|app\.py|wsgi\.py|asgi\.py|manage\.py|index\.(js|ts|jsx|tsx)|app\.(js|ts|jsx|tsx)|server\.(js|ts)|cli\.(js|ts|py))$/i
const MAX_BODY_BYTES = 1_000_000
const MAX_ATTEMPTS = 3

// 最近请求诊断环（内存，GET /api/prompt-enhance/log 可读）
const recentRequests = []
function markRequest(state, extra) {
  const e = recentRequests[recentRequests.length - 1]
  if (!e) return
  e.state = state
  e.ms = Date.now() - e.ts
  if (extra) Object.assign(e, extra)
}

// 各模式的上下文采集预算与模型参数。basic 不读取项目上下文。
const MODES = {
  basic: {
    id: 'basic',
    label: '基础',
    needsContext: false,
    depth: 0, treeLines: 0, treeChars: 0, fileChars: 0, contentChars: 0,
    maxTokens: 2000,
    temperature: 0.4,
    // 'off'：关闭隐藏推理（适配器映射为 thinking.disabled）。本模型即使 low 档也会
    // 推理 1500+ tokens，既慢又可能吃光输出预算 → 基础/标准一律关推理提速。
    effort: 'off',
    extra: '模式：基础润色。不提供项目上下文，仅做文本层面的清理与结构化：去口头禅与冗余、修正错别字和语病、补齐任务目标/约束/输出格式等缺失要素，保持原意与篇幅。',
  },
  standard: {
    id: 'standard',
    label: '标准',
    needsContext: true,
    depth: 3, treeLines: 160, treeChars: 7000, fileChars: 6000, contentChars: 11000,
    maxTokens: 3000,
    temperature: 0.3,
    effort: 'off',
    extra: '模式：标准增强。以下提供项目上下文（目录结构、依赖配置与关键代码），请从中提炼项目特定信息（技术栈、目录结构、已有模块/函数/API、依赖、命名约定、入口文件）并融入提示词；需要引用具体文件或模块时给出路径。',
  },
  expert: {
    id: 'expert',
    label: '专家',
    needsContext: true,
    depth: 4, treeLines: 260, treeChars: 12000, fileChars: 9000, contentChars: 18000,
    maxTokens: 5000,
    temperature: 0.2,
    // 专家保留推理（high），预算给足以免推理耗尽输出。
    effort: 'high',
    extra: '模式：专家增强。以下提供更深层的项目上下文。请先做任务分析：该任务涉及哪些模块/文件、需要哪些已有信息、输出应如何验收；再输出增强提示词。引用具体文件路径与现有符号，给出可验证的验收标准。',
  },
}

async function collectContext(fs, cwd, cfg) {
  const root = await fs.resolve(cwd)
  const info = await fs.stat(root).catch(() => undefined)
  if (!info || info.type !== 'directory') return null

  const tree = []
  const blocks = []
  let budget = cfg.contentChars
  let treeChars = 0
  const indent = (d) => '  '.repeat(d)
  const pushTree = (line) => {
    if (tree.length < cfg.treeLines && treeChars < cfg.treeChars) {
      tree.push(line)
      treeChars += line.length + 1
    }
  }
  async function readCapped(entry, cap) {
    try {
      const text = await fs.readText(entry.target)
      if (!text) return null
      return text.length > cap ? text.slice(0, cap) : text
    } catch (e) {
      return null
    }
  }
  async function walk(target, depth) {
    if (budget <= 0) return
    let entries = []
    try { entries = await fs.listDir(target) } catch (e) { return }
    const dirs = []
    for (const entry of entries) {
      if (entry.type === 'directory') {
        if (!SKIP_DIRS.has(entry.name) && depth < cfg.depth) dirs.push(entry)
        else pushTree(indent(depth) + entry.name + '/')
      } else if (entry.type === 'file') {
        pushTree(indent(depth) + entry.name + (typeof entry.size === 'number' ? ' (' + entry.size + 'B)' : ''))
        if (budget <= 0) continue
        const isConfig = CONFIG_NAME.test(entry.name)
        const isEntry = !isConfig && depth <= 2 && ENTRY_NAME.test(entry.name)
        const sizeOk = typeof entry.size !== 'number' || entry.size <= (isConfig ? 20000 : 30000)
        if (sizeOk && (isConfig || isEntry)) {
          const text = await readCapped(entry, isConfig ? cfg.fileChars : 5000)
          if (text) {
            const piece = '\n--- ' + (isConfig ? '配置文件' : '入口文件') + ': ' + entry.name + ' ---\n' + text + '\n'
            const take = Math.min(piece.length, budget)
            blocks.push(piece.slice(0, take))
            budget -= take
          }
        }
      } else {
        pushTree(indent(depth) + entry.name)
      }
    }
    for (const dir of dirs) await walk(dir.target, depth + 1)
  }
  await walk(root, 0)
  const parts = ['项目根目录：' + cwd, '', '=== 目录结构 ===', tree.join('\n')]
  if (blocks.length > 0) {
    parts.push('')
    parts.push('=== 依赖配置与关键代码 ===')
    parts.push(blocks.join(''))
  }
  return parts.join('\n')
}

// 组装各模式共用的 system prompt。核心改写规则（语言/语气跟随、逐字保留、
// 待确认项）对所有模式生效，模式差异通过 extra 段落注入。
function buildSystem(mode) {
  return [
    '你是资深提示词工程师。你的任务：把用户的“原始提示词”重写为一份更具体、更可执行、更贴合实际的增强提示词，以便让代码/文档生成模型产出更准确的回答。',
    '要求：',
    '1. 保留原始意图、语言和风格：用与原始提示词相同的语言输出（用户用中文写就用中文，用英文写就用英文；需要代码示例时用代码块）。',
    '2. 语气跟随原稿：保留用户自然的表达口吻，只清理含糊与冗余表达，不要改成正式、营销或机器人腔；代码块、文件路径、命令行、标识符、技术术语一律逐字保留。',
    '3. 明确任务目标、输入、输出格式、约束（例如“不要改动无关文件”“遵循现有代码风格”）以及可验证的验收标准。',
    '4. 上下文未提到的信息不要编造；若原始提示词缺少任务目标、输入、输出格式等关键信息，在增强结果的最末尾单独追加一段待确认清单：先输出一行“── 待确认 ──”，随后每行一条以“- ”开头的待确认项（只列缺失项，不要编造答案）。该清单是给用户的提示，不属于增强正文；若信息足够，不要输出该段。',
    '5. 直接输出增强后的提示词本身：不要输出任何解释、前言、结尾语或额外标记。',
    mode.extra,
  ].join('\n')
}

// 收集候选模型：会话默认模型优先，随后按 provider 顺序补足，最多 MAX_ATTEMPTS 个。
async function collectCandidates(llm, defaultModel) {
  const out = []
  const seen = new Set()
  const push = (provider, model) => {
    if (!provider || !model) return
    const key = provider + '::' + model
    if (seen.has(key)) return
    seen.add(key)
    out.push({ provider, model })
  }
  if (defaultModel && typeof defaultModel.currentSelection === 'function') {
    try {
      const sel = defaultModel.currentSelection()
      if (sel) push(sel.provider, sel.model)
    } catch (e) { /* ignore */ }
  }
  try {
    const providers = llm.listProviders()
    for (const p of providers) {
      if (out.length >= MAX_ATTEMPTS) break
      const models = await llm.listModels(p.id).catch(() => [])
      for (const m of models.slice(0, 2)) {
        push(p.id, m.id)
        if (out.length >= MAX_ATTEMPTS) break
      }
    }
  } catch (e) { /* ignore */ }
  return out.slice(0, MAX_ATTEMPTS)
}

// 单次流式调用。返回 { text }、{ failed: 原因, code? } 或 { canceled: true }，绝不抛出。
// opts.signal 传入 llm.stream 实现取消；opts.plain=true 时不带 reasoningEffort。
async function streamAttempt(llm, candidate, system, user, cfg, opts = {}) {
  const options = {
    provider: candidate.provider,
    model: candidate.model,
    system,
    messages: [{ role: 'user', content: [{ type: 'text', text: user }] }],
    temperature: cfg.temperature,
    maxTokens: cfg.maxTokens,
  }
  if (opts.signal) options.signal = opts.signal
  if (!opts.plain && cfg.effort) options.reasoningEffort = cfg.effort
  let text = ''
  let failed = null
  let code = null
  let finishReason = null
  try {
    for await (const chunk of llm.stream(options)) {
      if (chunk.type === 'text-delta') text += chunk.text
      else if (chunk.type === 'finish') {
        finishReason = chunk.reason
        if (chunk.reason === 'error' || chunk.reason === 'aborted') failed = chunk.reason
      }
    }
  } catch (e) {
    code = e && e.code ? e.code : null
    failed = e && e.message ? e.message : String(e)
  }
  if (opts.signal && opts.signal.aborted) return { canceled: true }
  if (failed) return { failed, code }
  text = text.trim()
  if (!text) {
    // finish=length 且无正文：隐藏推理吃光了输出预算（本模型 low 档也会推理 1500+ tokens）
    return finishReason === 'length'
      ? { failed: '空输出（推理耗尽预算）', code: 'EMPTY_LENGTH' }
      : { failed: '空输出' }
  }
  return { text }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk) => {
      data += chunk
      if (data.length > MAX_BODY_BYTES) {
        req.destroy()
        reject(new Error('请求体过大'))
      }
    })
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {})
      } catch (e) {
        reject(new Error('请求体不是合法 JSON'))
      }
    })
    req.on('error', reject)
  })
}

function sendJson(res, payload) {
  try {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(payload))
  } catch (e) {
    // 客户端可能已断开（取消或关页），忽略
  }
}

function apply(ctx) {
  ctx.effect(() => {
    const disposeEnhance = ctx.webServer.register({
      kind: 'exact',
      path: '/api/prompt-enhance/enhance',
      handler: async (req, res) => {
        try {
        let args = {}
        try {
          args = await readBody(req)
        } catch (e) {
          return sendJson(res, { ok: false, message: '请求体解析失败：' + (e && e.message ? e.message : String(e)) })
        }

        const sessionId = args && typeof args.sessionId === 'string' ? args.sessionId : ''
        const draft = args && typeof args.draft === 'string' ? args.draft.trim() : ''
        if (!draft) return sendJson(res, { ok: false, message: '输入框为空，请先输入要增强的提示词。' })

        const modeId = args && typeof args.mode === 'string' && MODES[args.mode] ? args.mode : 'standard'
        const mode = MODES[modeId]

        recentRequests.push({ ts: Date.now(), state: 'recv', mode: modeId, session: (sessionId || '').slice(0, 12) })
        if (recentRequests.length > 50) recentRequests.shift()

        let context = ''
        if (mode.needsContext) {
          const sessions = ctx.get('sessions')
          let cwd = null
          if (sessions && sessionId) {
            try {
              const session = sessions.get(sessionId)
              if (session && session.header && typeof session.header.cwd === 'string' && session.header.cwd) {
                cwd = session.header.cwd
              }
            } catch (e) { cwd = null }
          }
          const fs = ctx.get('fs')
          if (!fs) return sendJson(res, { ok: false, message: '文件系统服务不可用，无法读取项目上下文。' })
          if (!cwd) return sendJson(res, { ok: false, message: '当前会话未关联工作目录，无法读取项目上下文。' })

          try { context = await collectContext(fs, cwd, mode) } catch (e) { context = '' }
          if (!context || !context.trim()) {
            return sendJson(res, { ok: false, message: '未能读取到项目上下文（目录为空或内容不可读），已保留你的原始输入。' })
          }
        }

        const llm = ctx.get('llm')
        if (!llm) return sendJson(res, { ok: false, message: '模型服务不可用，暂时无法增强提示词。' })

        const candidates = await collectCandidates(llm, ctx.get('agentDefaultModel'))
        if (candidates.length === 0) return sendJson(res, { ok: false, message: '未找到可用的模型配置，暂时无法增强提示词。' })

        const system = buildSystem(mode)
        const user = mode.needsContext
          ? '项目上下文：\n' + context + '\n\n原始提示词：\n' + draft + '\n\n请基于项目上下文重写并增强上面的原始提示词，直接输出增强结果。'
          : '原始提示词：\n' + draft + '\n\n请重写并增强上面的原始提示词，直接输出增强结果。'

        // 取消支持：客户端断开 fetch 时中断服务端流式调用
        const ctrl = new AbortController()
        const onResClose = () => {
          if (!res.writableFinished) {
            const e = recentRequests[recentRequests.length - 1]
            if (e) e.aborted = true
            ctrl.abort()
          }
        }
        res.on('close', onResClose)

        const failures = []
        let enhanced = null
        let canceled = false
        let usedModel = ''
        for (const candidate of candidates) {
          let r = await streamAttempt(llm, candidate, system, user, mode, { signal: ctrl.signal })
          if (r.canceled) { canceled = true; break }
          const effortUnsupported = r.code === 'UNSUPPORTED_REASONING_EFFORT' ||
            (r.failed && /reasoning effort/i.test(String(r.failed)))
          if (!r.text && r.code === 'EMPTY_LENGTH') {
            // 隐藏推理吃光输出预算：同候选关闭推理并加大预算重试一次
            const starvedCfg = { ...mode, effort: 'off', maxTokens: Math.max(mode.maxTokens * 3, 6000) }
            const retry = await streamAttempt(llm, candidate, system, user, starvedCfg, { signal: ctrl.signal })
            if (retry.canceled) { canceled = true; break }
            if (retry.text) { enhanced = retry.text; usedModel = candidate.provider + '/' + candidate.model; break }
            failures.push(candidate.provider + '/' + candidate.model + '（' + retry.failed + '）')
          } else if (!r.text && effortUnsupported) {
            // 该模型/适配器不支持 reasoningEffort：同一候选去掉 effort 重试一次
            const plain = await streamAttempt(llm, candidate, system, user, mode, { signal: ctrl.signal, plain: true })
            if (plain.canceled) { canceled = true; break }
            if (plain.text) { enhanced = plain.text; usedModel = candidate.provider + '/' + candidate.model; break }
            failures.push(candidate.provider + '/' + candidate.model + '（' + plain.failed + '）')
          } else if (r.text) {
            enhanced = r.text
            usedModel = candidate.provider + '/' + candidate.model
            break
          } else {
            failures.push(candidate.provider + '/' + candidate.model + '（' + r.failed + '）')
          }
        }
        res.off('close', onResClose)

        if (canceled) {
          markRequest('canceled', {})
          return sendJson(res, { ok: false, canceled: true, message: '已取消增强。' })
        }
        if (!enhanced) {
          markRequest('failed', { msg: failures.join('；') })
          return sendJson(res, { ok: false, message: '模型调用全部失败：' + failures.join('；') + '，已保留你的原始输入。' })
        }
        // 剥离“待确认”段：仅供用户在 UI 里参考，不随正文发送给下游模型
        let confirmations = ''
        if (enhanced) {
          const markers = ['── 待确认 ──', '需要确认：']
          let idx = -1
          let markerLen = 0
          for (const m of markers) {
            const i = enhanced.indexOf(m)
            if (i !== -1) { idx = i; markerLen = m.length; break }
          }
          if (idx !== -1) {
            confirmations = enhanced.slice(idx + markerLen).trim()
            enhanced = enhanced.slice(0, idx).trim()
          }
        }
        markRequest('ok', { len: enhanced.length, conf: confirmations.length, model: usedModel })
        return sendJson(res, { ok: true, mode: modeId, enhanced, confirmations })
      } catch (e) {
        console.error('prompt-enhance failed', e)
        return sendJson(res, { ok: false, message: '提示词增强失败：' + (e && e.message ? e.message : String(e)) })
      }
    },
    })
    const disposeLog = ctx.webServer.register({
      kind: 'exact',
      path: '/api/prompt-enhance/log',
      handler: async (req, res) => sendJson(res, { requests: recentRequests }),
    })
    const disposeLogError = ctx.webServer.register({
      kind: 'exact',
      path: '/api/prompt-enhance/log-error',
      handler: async (req, res) => {
        try {
          const args = await readBody(req)
          recentRequests.push({
            ts: Date.now(),
            state: 'client-error',
            msg: String((args && args.msg) || '').slice(0, 400),
            stack: String((args && args.stack) || '').slice(0, 800),
          })
          if (recentRequests.length > 60) recentRequests.shift()
        } catch (e) { /* ignore */ }
        return sendJson(res, { ok: true })
      },
    })
    return () => { disposeEnhance(); disposeLog(); disposeLogError() }
  }, 'prompt-enhance: routes')
}

export { name, inject, apply }

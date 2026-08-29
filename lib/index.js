// prompt-enhance — Host half (static profile plugin).
// Serves POST /api/prompt-enhance/enhance: reads the caller's session cwd,
// collects a bounded project context (tree + key config/entry files), then
// asks the session's default LLM to rewrite the draft into an enhanced prompt.
//
// v1.3.0:
//   - 待确认问答闭环：模型优先从项目上下文自答（标注假设，减少待确认）；剩余
//     待确认项由用户在对比面板逐条回答，客户端带答案请求本路由做“修订增强正文”
//     的第二轮调用（answers + baseEnhanced），返回修订后的增强结果与新待确认清单。
//   - 通用模型适配：不针对任何厂商硬编码。任何经 DSH 注册的模型/网关都能用——
//     发送推理档位失败（网关拒绝参数、适配器不支持、空输出耗尽预算等）时，
//     自动在同一候选上降级重试（去档位 / 关推理加大预算），仍失败再按序回退
//     候选模型，且逐次记录失败原因。
//   - 可配置：组合行 config 支持按模式覆盖 effort/temperature/maxTokens/上下文
//     预算/extra，以及固定候选模型链、最大尝试次数、替换系统提示词等。
//   - 修复 finish 解析：适配器流结束 chunk 的 reason 是 { kind, failure? } 对象，
//     按 kind 判定 error/aborted/max-tokens，避免空输出重试逻辑失效。
//
// Plain ESM, no build step. Mounted by the web profile composition.

/** 插件标识：组合行 row id、诊断日志前缀与安装目录名。 */
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

// 错误响应码：客户端（lib/client.js）按 code 映射为用户可操作提示。
const ERR_CODE = {
  BAD_BODY: 'BAD_BODY',
  EMPTY_DRAFT: 'EMPTY_DRAFT',
  FS_UNAVAILABLE: 'FS_UNAVAILABLE',
  NO_CWD: 'NO_CWD',
  NO_CONTEXT: 'NO_CONTEXT',
  LLM_UNAVAILABLE: 'LLM_UNAVAILABLE',
  NO_CANDIDATES: 'NO_CANDIDATES',
  ALL_MODELS_FAILED: 'ALL_MODELS_FAILED',
  EMPTY_OUTPUT: 'EMPTY_OUTPUT',
  CANCELED: 'CANCELED',
  INTERNAL: 'INTERNAL',
}

// 最近请求诊断环（内存，GET /api/prompt-enhance/log 可读）
const recentRequests = []

/**
 * 更新一条请求记录的状态与附加信息（诊断环用）。记录对象由调用方持有，
 * 避免并发请求下“最后一条”被误更新。
 * @param {object} record 该请求的记录对象（recentRequests.push 时创建）
 * @param {string} state 状态标记（'recv' | 'ok' | 'failed' | 'canceled' 等）
 * @param {object} [extra] 需要合并进记录的附加字段（如所用模型、错误信息）
 */
function markRequest(record, state, extra) {
  if (!record) return
  record.state = state
  record.ms = Date.now() - record.ts
  if (extra) Object.assign(record, extra)
}

// 各模式的默认上下文采集预算与模型参数。basic 不读取项目上下文。
// 组合行 config.modes.<id> 可逐项覆盖（见 resolveConfig / README「配置」）。
const DEFAULT_MODES = {
  basic: {
    id: 'basic',
    label: '基础',
    needsContext: false,
    depth: 0, treeLines: 0, treeChars: 0, fileChars: 0, contentChars: 0,
    maxTokens: 2000,
    temperature: 0.4,
    // 'off'：关闭隐藏推理（适配器映射为 thinking.disabled）。部分模型即使 low
    // 档也会推理 1500+ tokens——既慢又可能吃光输出预算导致空输出。基础/标准默认
    // 关推理提速；不支持或拒绝该参数的网关会自动降级重试（见 attemptCandidate）。
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
    // 专家默认保留推理（high），预算给足以免推理耗尽输出。
    effort: 'high',
    extra: '模式：专家增强。以下提供更深层的项目上下文。请先做任务分析：该任务涉及哪些模块/文件、需要哪些已有信息、输出应如何验收；再输出增强提示词。引用具体文件路径与现有符号，给出可验证的验收标准。',
  },
}

const MODE_KEYS = ['label', 'needsContext', 'depth', 'treeLines', 'treeChars', 'fileChars', 'contentChars', 'maxTokens', 'temperature', 'effort', 'extra']
// 需要为正整数的数值模式键（resolveConfig 统一裁剪）
const NUM_MODE_KEYS = new Set(['depth', 'treeLines', 'treeChars', 'fileChars', 'contentChars', 'maxTokens'])

function num(v, fallback) {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : fallback
}
/**
 * 解析组合行 config（apply 的第二参）。所有字段可选，缺省即默认行为。
 * - maxAttempts：候选模型链长度上限（1-6，默认 3）
 * - candidates：[{ provider, model }] 固定候选链（前置优先于会话默认模型）
 * - autoFill：false 时不再自动从已注册 provider 补足候选（默认 true）
 * - system：完整替换内置系统提示词（默认使用内置）
 * - modes.<id>：按模式覆盖（label/needsContext/depth/treeLines/treeChars/
 *   fileChars/contentChars/maxTokens/temperature/effort/extra）
 *   effort 取值：'off'|'low'|'high'|'max' 等按模型支持发送；'none' 表示完全不发送。
 * @param {import('./index.d.ts').PromptEnhanceConfig} [raw] 组合行传入的原始 config
 * @returns {import('./index.d.ts').ResolvedPromptEnhanceConfig} 规范化后的配置
 */
function resolveConfig(raw) {
  const config = (raw && typeof raw === 'object') ? raw : {}
  /** @type {Record<string, import('./index.d.ts').ResolvedPromptEnhanceMode>} */
  const modes = {}
  const overrides = (config.modes && typeof config.modes === 'object') ? config.modes : {}
  for (const id of /** @type {Array<'basic' | 'standard' | 'expert'>} */ (Object.keys(DEFAULT_MODES))) {
    const base = DEFAULT_MODES[id]
    const over = (overrides[id] && typeof overrides[id] === 'object') ? overrides[id] : {}
    const mode = { ...base }
    for (const key of MODE_KEYS) {
      if (over[key] === undefined) continue
      if (key === 'needsContext') mode[key] = !!over[key]
      else if (key === 'label' || key === 'effort' || key === 'extra') mode[key] = String(over[key])
      else if (key === 'temperature') mode[key] = typeof over[key] === 'number' ? Math.min(2, Math.max(0, over[key])) : over[key]
      else if (NUM_MODE_KEYS.has(key)) mode[key] = typeof over[key] === 'number' ? Math.max(1, Math.trunc(over[key])) : over[key]
      else mode[key] = over[key]
    }
    modes[id] = mode
  }
  const candidates = Array.isArray(config.candidates)
    ? config.candidates.filter((c) => c && typeof c === 'object' && typeof c.provider === 'string' && c.provider && typeof c.model === 'string' && c.model)
    : []
  return {
    maxAttempts: Math.max(1, Math.min(6, Math.trunc(num(config.maxAttempts, 3)))),
    candidates,
    autoFill: config.autoFill !== false,
    system: typeof config.system === 'string' && config.system.trim() ? config.system.trim() : '',
    modes,
  }
}

/**
 * 采集项目上下文（目录树 + 依赖/配置/入口文件），带预算上限。
 * 以会话 cwd 为采集根：fs 服务是全局单例，其根并不等于会话工作区根。
 * @param {import('../typings/dsh.d.ts').DshFs} fs DSH 文件系统服务（resolve/stat/listDir/readText）
 * @param {string} cwd 会话工作目录
 * @param {import('./index.d.ts').ResolvedPromptEnhanceMode} cfg 模式配置（depth/treeLines/treeChars/fileChars/contentChars）
 * @returns {Promise<string|null>} 拼接好的上下文文本；目录不可读时返回 null
 */
async function collectContext(fs, cwd, cfg) {
  // DSH 的 fs.resolve() 返回 { targetKey, displayPath } 目标对象，后续
  // stat/listDir/readText 均接收该目标对象，无需再取字符串路径。
  // 会话 cwd（session.header.cwd）就是权威项目根：它是 DSH 创建会话时校验过的
  // 绝对目录路径。fs 服务是全局单例（其 cwd 默认是启动 dsh 的目录），不等于会话
  // 的工作区根；因此不能用 fs.resolve('.') 做“cwd 必须位于其下”的包含校验——多
  // 工作区场景下会话 cwd 在 fs 服务根之外属正常，那样的校验会误判越权，导致标准/
  // 专家模式报“未能读取到项目上下文”。
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

/**
 * 组装各模式共用的 system prompt。核心改写规则（语言/语气跟随、逐字保留、
 * 待确认项）对所有模式生效，模式差异通过 extra 段落注入；config.system 可整体替换。
 * @param {import('./index.d.ts').ResolvedPromptEnhanceMode} mode 模式配置（含 extra 说明）
 * @param {import('./index.d.ts').ResolvedPromptEnhanceConfig} cfg 全局配置（system 覆盖项）
 * @returns {string} 完整 system prompt
 */
function buildSystem(mode, cfg) {
  if (cfg.system) return cfg.system
  return [
    '你是资深提示词工程师。你的任务：把用户的“原始提示词”重写为一份更具体、更可执行、更贴合实际的增强提示词，以便让代码/文档生成模型产出更准确的回答。',
    '要求：',
    '1. 保留原始意图、语言和风格：用与原始提示词相同的语言输出（用户用中文写就用中文，用英文写就用英文；需要代码示例时用代码块）。',
    '2. 语气跟随原稿：保留用户自然的表达口吻，只清理含糊与冗余表达，不要改成正式、营销或机器人腔；代码块、文件路径、命令行、标识符、技术术语一律逐字保留。',
    '3. 明确任务目标、输入、输出格式、约束（例如“不要改动无关文件”“遵循现有代码风格”）以及可验证的验收标准。',
    '4. 上下文未提到的信息不要编造。能从项目上下文（技术栈、入口文件、目录约定、已有模块/API/依赖）推断的信息，直接采用并在增强正文中体现，可在括号内标注“（假设：…）”让用户可见可改，不要列入待确认。只有无法从上下文推断、且必须由用户决定的关键信息（如目标读者、部署目标、验收偏好）才列入待确认清单：在增强结果的最末尾先输出一行“── 待确认 ──”，随后每行一条以“- ”开头的待确认项，每条只问一个明确、可直接作答的问题，不要编造答案。该清单是给用户的提示，不属于增强正文；若信息足够，不要输出该段。',
    '5. 直接输出增强后的提示词本身：不要输出任何解释、前言、结尾语或额外标记。',
    mode.extra,
  ].join('\n')
}

/**
 * 规范化客户端提交的待确认回答。兼容 {question, answer} / {q, a} / {text, value} 等
 * 键名；过滤空项并裁剪长度，防止脏数据进入模型调用。
 * @param {unknown} raw 请求体 answers 字段（应为数组）
 * @returns {Array<{question: string, answer: string}>} 规范化后的回答列表（≤20 条）
 */
function normalizeAnswers(raw) {
  if (!Array.isArray(raw)) return []
  const out = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const question = String(item.question ?? item.q ?? item.text ?? '').trim().slice(0, 500)
    const answer = String(item.answer ?? item.a ?? item.value ?? '').trim().slice(0, 2000)
    if (question && answer) {
      out.push({ question, answer })
      if (out.length >= 20) break
    }
  }
  return out
}

/**
 * 修订轮次的 system prompt：根据用户确认的信息修订已有的增强正文，
 * 而不是从头重写。config.system 整体替换时仍追加修订要求，保证行为一致。
 * @param {import('./index.d.ts').ResolvedPromptEnhanceMode} mode 模式配置（含 extra 说明）
 * @param {import('./index.d.ts').ResolvedPromptEnhanceConfig} cfg 全局配置（system 覆盖项）
 * @returns {string} 修订轮次的完整 system prompt
 */
function buildReviseSystem(mode, cfg) {
  const rules = [
    '你是资深提示词工程师。本次任务：根据用户确认的信息，修订一份已有的增强提示词。',
    '要求：',
    '1. 保留增强正文中已有的有效内容（任务目标、约束、输出格式、路径引用等），只把缺失信息/待确认占位替换为用户确认的内容，并让上下文衔接自然；不要整体重写。',
    '2. 语言与语气跟随原稿；代码块、文件路径、命令行、标识符、技术术语逐字保留。',
    '3. 如实采用用户确认的信息，不要编造；除此之外仍缺失且无法从上下文推断、必须由用户决定的关键信息，才在末尾追加新清单：先输出一行“── 待确认 ──”，随后每行一条以“- ”开头的待确认项（每条一个可直接作答的问题）；信息足够则不输出。',
    '4. 直接输出修订后的完整增强提示词本身，不要输出任何解释、前言或结尾语。',
    mode.extra,
  ].join('\n')
  return cfg.system ? cfg.system + '\n\n本次为修订已有增强正文，补充要求：\n' + rules : rules
}

/**
 * 修订轮次的用户消息：原始提示词 + 用户确认信息 + 上一版增强正文。
 * @param {string} draft 原始提示词
 * @param {string} enhanced 上一版增强正文（待修订）
 * @param {Array<{question: string, answer: string}>} answers 用户确认的回答
 * @returns {string} 修订轮次的用户消息
 */
function buildReviseUser(draft, enhanced, answers) {
  const lines = answers.map((a, i) => (i + 1) + '. 问题：' + a.question + '\n   确认：' + a.answer)
  return [
    '原始提示词：\n' + draft,
    '',
    '用户确认的信息：\n' + lines.join('\n'),
    '',
    '上一版增强正文（待修订）：\n' + (enhanced || '（无）'),
    '',
    '请基于用户确认的信息修订上面的增强正文：把待确认事项与缺失信息替换为确认内容并完善衔接，直接输出修订后的完整增强正文。',
  ].join('\n')
}

/**
 * 组装 enhance 路由的用户消息：无回答时保持原有格式；有回答时优先走修订轮次
 * （baseEnhanced 存在），否则把回答作为补充信息随原始提示词一起重写。
 * @param {import('./index.d.ts').ResolvedPromptEnhanceMode} mode 模式配置（needsContext）
 * @param {string} context 项目上下文（basic 模式为空字符串）
 * @param {string} draft 原始提示词
 * @param {Array<{question: string, answer: string}>} answers 用户确认的回答
 * @param {string} baseEnhanced 上一版增强正文（可为空）
 * @returns {string} 用户消息
 */
function buildUserMessage(mode, context, draft, answers, baseEnhanced) {
  if (answers.length > 0 && baseEnhanced) return buildReviseUser(draft, baseEnhanced, answers)
  const contextPart = mode.needsContext ? '项目上下文：\n' + context + '\n\n' : ''
  if (answers.length > 0) {
    const lines = answers.map((a, i) => (i + 1) + '. ' + a.question + ' → ' + a.answer)
    const basis = mode.needsContext ? '以上项目上下文与' : ''
    return contextPart + '用户确认的信息：\n' + lines.join('\n') + '\n\n原始提示词：\n' + draft +
      '\n\n请基于' + basis + '用户确认的信息重写并增强上面的原始提示词，直接输出增强结果。'
  }
  const tail = mode.needsContext
    ? '请基于项目上下文重写并增强上面的原始提示词，直接输出增强结果。'
    : '请重写并增强上面的原始提示词，直接输出增强结果。'
  return contextPart + '原始提示词：\n' + draft + '\n\n' + tail
}

/**
 * 收集候选模型：固定候选（config.candidates）优先，随后会话默认模型，
 * 最后按 provider 顺序自动补足（autoFill），最多 cfg.maxAttempts 个。
 * @param {import('../typings/dsh.d.ts').DshLlm} llm DSH 模型服务（listProviders/listModels）
 * @param {import('../typings/dsh.d.ts').DshDefaultModel | undefined} defaultModel 会话默认模型（currentSelection()）
 * @param {import('./index.d.ts').ResolvedPromptEnhanceConfig} cfg 全局配置（candidates/autoFill/maxAttempts）
 * @returns {Promise<Array<{provider: string, model: string}>>} 候选模型链
 */
async function collectCandidates(llm, defaultModel, cfg) {
  const out = []
  const seen = new Set()
  const push = (provider, model) => {
    if (!provider || !model) return
    const key = provider + '::' + model
    if (seen.has(key)) return
    seen.add(key)
    out.push({ provider, model })
  }
  for (const c of cfg.candidates) push(c.provider, c.model)
  if (defaultModel && typeof defaultModel.currentSelection === 'function') {
    try {
      const sel = defaultModel.currentSelection()
      if (sel) push(sel.provider, sel.model)
    } catch (e) { /* ignore */ }
  }
  if (cfg.autoFill !== false) {
    try {
      const providers = llm.listProviders()
      for (const p of providers) {
        if (out.length >= cfg.maxAttempts) break
        const models = await llm.listModels(p.id).catch(() => [])
        for (const m of models.slice(0, 2)) {
          push(p.id, m.id)
          if (out.length >= cfg.maxAttempts) break
        }
      }
    } catch (e) { /* ignore */ }
  }
  return out.slice(0, cfg.maxAttempts)
}

/**
 * 流结束 reason 的兼容解析：契约上是 { kind, failure? } 对象，防御性兼容字符串。
 * @param {import('./index.d.ts').StreamFinishReason | null | undefined} reason 流结束 reason
 * @returns {string} 结束类型（'' 表示无）
 */
function reasonKind(reason) {
  if (!reason) return ''
  if (typeof reason === 'string') return reason
  return reason.kind || ''
}
/**
 * 从流结束 reason 中提取失败错误码（如 'EMPTY_LENGTH'）。
 * @param {import('./index.d.ts').StreamFinishReason | null | undefined} reason 流结束 reason
 * @returns {string} 错误码
 */
function reasonCode(reason) {
  if (reason && typeof reason === 'object' && reason.failure) return reason.failure.code || ''
  return ''
}
/**
 * 从流结束 reason 中提取人类可读的失败信息。
 * @param {import('./index.d.ts').StreamFinishReason | null | undefined} reason 流结束 reason
 * @returns {string} 失败信息
 */
function reasonMessage(reason) {
  if (reason && typeof reason === 'object' && reason.failure && reason.failure.message) return reason.failure.message
  return ''
}

/**
 * 单次流式调用。返回 { text }、{ failed: 原因, code? } 或 { canceled: true }，绝不抛出。
 * signal 传入 llm.stream 实现取消；effort 为要发送的档位，undefined 表示完全不发送。
 * @param {import('../typings/dsh.d.ts').DshLlm} llm DSH 模型服务（stream）
 * @param {import('./index.d.ts').PromptEnhanceCandidate} candidate 候选模型
 * @param {string} system system prompt
 * @param {string} user 用户消息（增强请求）
 * @param {import('./index.d.ts').ResolvedPromptEnhanceMode} cfg 模式配置（temperature/maxTokens）
 * @param {string|undefined} [effort] 推理档位
 * @param {AbortSignal} [signal] 取消信号
 * @returns {Promise<{text?: string, failed?: string, code?: string|null, canceled?: true}>}
 */
async function streamAttempt(llm, candidate, system, user, cfg, effort, signal) {
  const options = {
    provider: candidate.provider,
    model: candidate.model,
    system,
    messages: [{ role: 'user', content: [{ type: 'text', text: user }] }],
    temperature: cfg.temperature,
    maxTokens: cfg.maxTokens,
  }
  if (signal) options.signal = signal
  if (effort) options.reasoningEffort = effort
  let text = ''
  let failed = null
  let code = null
  let finishReason = null
  try {
    for await (const chunk of llm.stream(options)) {
      if (chunk.type === 'text-delta') text += chunk.text
      else if (chunk.type === 'finish') {
        finishReason = chunk.reason
        const kind = reasonKind(chunk.reason)
        if (kind === 'error' || kind === 'aborted') {
          failed = reasonMessage(chunk.reason) || kind
          code = reasonCode(chunk.reason) || null
        }
      }
    }
  } catch (e) {
    code = e && e.code ? e.code : null
    failed = e && e.message ? e.message : String(e)
  }
  if (signal && signal.aborted) return { canceled: true }
  if (failed) return { failed, code }
  text = text.trim()
  if (!text) {
    // finish=max-tokens 且无正文：输出预算被耗尽（隐藏推理吃光预算等）
    return reasonKind(finishReason) === 'max-tokens'
      ? { failed: '空输出（输出预算耗尽）', code: 'EMPTY_LENGTH' }
      : { failed: '空输出' }
  }
  return { text }
}

/**
 * 单个候选的完整尝试流程：先按模式档位调用；失败后按失败类型降级重试
 * （空输出耗尽预算 → 关推理并加大预算；其余任何失败 → 完全不发送档位参数），
 * 若关推理加大预算后失败原因不再是预算耗尽，再补一次彻底无档位调用。全程 ≤3 次调用、绝不抛出。
 * @param {import('../typings/dsh.d.ts').DshLlm} llm DSH 模型服务（stream）
 * @param {import('./index.d.ts').PromptEnhanceCandidate} candidate 候选模型
 * @param {string} system system prompt
 * @param {string} user 用户消息
 * @param {import('./index.d.ts').ResolvedPromptEnhanceMode} mode 模式配置（effort/temperature/maxTokens）
 * @param {AbortSignal} [signal] 取消信号
 * @returns {Promise<{text?: string, failed?: string, canceled?: true}>}
 */
async function attemptCandidate(llm, candidate, system, user, mode, signal) {
  const withEffort = !!mode.effort && mode.effort !== 'none'
  const failures = []
  const run = (effort, over) => {
    const m = over ? { ...mode, ...over } : mode
    return streamAttempt(llm, candidate, system, user, m, effort, signal)
  }

  const first = await run(withEffort ? mode.effort : undefined)
  if (first.canceled) return { canceled: true }
  if (first.text) return { text: first.text }
  failures.push((withEffort ? '带档位(' + mode.effort + ')' : '普通调用') + (first.failed ? '：' + first.failed : ''))

  // 本次已是不带档位调用，再失败即候选失败
  if (!withEffort) return { failed: failures.join('；') }

  if (first.code === 'EMPTY_LENGTH') {
    // 隐藏推理吃光输出预算：同一候选关推理并加大预算重试
    const second = await run('off', { maxTokens: Math.max(mode.maxTokens * 3, 6000) })
    if (second.canceled) return { canceled: true }
    if (second.text) return { text: second.text }
    failures.push('关推理加大预算：' + second.failed)
    // 'off' 档位本身也可能被网关拒绝（部分网关连档位参数都不接受）：
    // 若这次失败不再是“预算耗尽”，最后再试一次彻底不带档位
    if (second.code !== 'EMPTY_LENGTH') {
      const third = await run(undefined)
      if (third.canceled) return { canceled: true }
      if (third.text) return { text: third.text }
      failures.push('无档位：' + third.failed)
    }
    return { failed: failures.join('；') }
  }

  // 任何其他失败（网关拒绝档位/thinking/developer 参数、适配器不支持档位、
  // 空输出、限流等）→ 同一候选去掉档位重试一次
  const second = await run(undefined)
  if (second.canceled) return { canceled: true }
  if (second.text) return { text: second.text }
  failures.push('无档位重试：' + second.failed)
  return { failed: failures.join('；') }
}

/**
 * 读取并解析请求体 JSON（带 1MB 大小上限）。
 * @param {import('node:http').IncomingMessage} req Node HTTP 请求对象
 * @returns {Promise<object>} 解析后的 JSON 对象
 */
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      size += buf.length
      if (size > MAX_BODY_BYTES) {
        req.destroy()
        reject(new Error('请求体过大'))
        return
      }
      chunks.push(buf)
    })
    req.on('end', () => {
      try {
        const data = Buffer.concat(chunks).toString('utf8')
        resolve(data ? JSON.parse(data) : {})
      } catch (e) {
        reject(new Error('请求体不是合法 JSON'))
      }
    })
    req.on('error', reject)
  })
}

/**
 * 发送 JSON 响应（客户端已断开时静默忽略）。
 * @param {import('node:http').ServerResponse} res Node HTTP 响应对象
 * @param {object} payload 响应体
 */
function sendJson(res, payload) {
  try {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(payload))
  } catch (e) {
    // 客户端可能已断开（取消或关页），忽略
  }
}

/**
 * 把“待确认”段从增强正文中剥离，供 UI 单独展示。
 * 支持 '── 待确认 ──' 与 '需要确认：' 两种标记；无标记时原样返回。
 * @param {string} enhanced 模型原始输出
 * @returns {{ text: string, confirmations: string }} 干净正文与待确认清单
 */
function splitConfirmations(enhanced) {
  if (!enhanced) return { text: '', confirmations: '' }
  const markers = ['── 待确认 ──', '需要确认：']
  for (const m of markers) {
    const i = enhanced.indexOf(m)
    if (i !== -1) {
      return { text: enhanced.slice(0, i).trim(), confirmations: enhanced.slice(i + m.length).trim() }
    }
  }
  return { text: enhanced, confirmations: '' }
}

/**
 * Cordis 插件入口：注册三个 API 路由（enhance/log/log-error）并随组合树生效。
 * - POST /api/prompt-enhance/enhance —— 增强请求主路由
 * - GET  /api/prompt-enhance/log     —— 最近请求诊断环
 * - POST /api/prompt-enhance/log-error —— 浏览器端错误上报
 * @param {import('../typings/dsh.d.ts').DshCtx} ctx Cordis 注入上下文（webServer/sessions/fs/llm/agentDefaultModel）
 * @param {import('./index.d.ts').PromptEnhanceConfig} [config] 组合行 config（见 resolveConfig）
 */
function apply(ctx, config) {
  const cfg = resolveConfig(config)
  const modes = cfg.modes

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
            return sendJson(res, { ok: false, code: ERR_CODE.BAD_BODY, message: '请求体解析失败：' + (e && e.message ? e.message : String(e)) })
          }

          const sessionId = args && typeof args.sessionId === 'string' ? args.sessionId : ''
          const draft = args && typeof args.draft === 'string' ? args.draft.trim() : ''
          if (!draft) return sendJson(res, { ok: false, code: ERR_CODE.EMPTY_DRAFT, message: '输入框为空，请先输入要增强的提示词。' })

          // 待确认问答闭环：answers 为客户端逐条回答，baseEnhanced 为上一版增强正文。
          // 有回答且带 baseEnhanced 时走“修订正文”第二轮调用，否则按补充信息重写。
          const answers = normalizeAnswers(args.answers)
          const baseEnhanced = typeof args.baseEnhanced === 'string' ? args.baseEnhanced.trim() : ''

          const modeId = args && typeof args.mode === 'string' && modes[args.mode] ? args.mode : 'standard'
          const mode = modes[modeId]

          const record = { ts: Date.now(), state: 'recv', mode: modeId, session: (sessionId || '').slice(0, 12) }
          recentRequests.push(record)
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
            if (!fs) {
              markRequest(record, 'failed', { msg: 'fs 服务不可用' })
              return sendJson(res, { ok: false, code: ERR_CODE.FS_UNAVAILABLE, message: '文件系统服务不可用，无法读取项目上下文。' })
            }
            if (!cwd) {
              markRequest(record, 'failed', { msg: '会话 header 缺少 cwd' })
              return sendJson(res, { ok: false, code: ERR_CODE.NO_CWD, message: '当前会话未关联工作目录，无法读取项目上下文。' })
            }

            let collectError = ''
            try { context = await collectContext(fs, cwd, mode) } catch (e) { collectError = e && e.message ? e.message : String(e) }
            if (!context || !context.trim()) {
              markRequest(record, 'failed', { msg: collectError ? 'collectContext 异常：' + collectError : 'collectContext 未产出上下文' })
              return sendJson(res, { ok: false, code: ERR_CODE.NO_CONTEXT, message: '未能读取到项目上下文（目录为空或内容不可读），已保留你的原始输入。' })
            }
          }

          const llm = ctx.get('llm')
          if (!llm) return sendJson(res, { ok: false, code: ERR_CODE.LLM_UNAVAILABLE, message: '模型服务不可用，暂时无法增强提示词。' })

          const candidates = await collectCandidates(llm, ctx.get('agentDefaultModel'), cfg)
          if (candidates.length === 0) return sendJson(res, { ok: false, code: ERR_CODE.NO_CANDIDATES, message: '未找到可用的模型配置，暂时无法增强提示词。' })

          const system = answers.length > 0 ? buildReviseSystem(mode, cfg) : buildSystem(mode, cfg)
          const user = buildUserMessage(mode, context, draft, answers, baseEnhanced)

          // 取消支持：客户端断开 fetch 时中断服务端流式调用
          const ctrl = new AbortController()
          const onResClose = () => {
            if (!res.writableFinished) {
              record.aborted = true
              ctrl.abort()
            }
          }
          res.on('close', onResClose)

          const failures = []
          let enhanced = null
          let canceled = false
          let usedModel = ''
          for (const candidate of candidates) {
            const r = await attemptCandidate(llm, candidate, system, user, mode, ctrl.signal)
            if (r.canceled) { canceled = true; break }
            if (r.text) { enhanced = r.text; usedModel = candidate.provider + '/' + candidate.model; break }
            failures.push(candidate.provider + '/' + candidate.model + '（' + r.failed + '）')
          }
          res.off('close', onResClose)

          const revise = answers.length > 0
          if (canceled) {
            markRequest(record, 'canceled', { revise })
            return sendJson(res, { ok: false, canceled: true, code: ERR_CODE.CANCELED, message: '已取消增强。' })
          }
          if (!enhanced) {
            markRequest(record, 'failed', { revise, msg: failures.join('；') })
            return sendJson(res, { ok: false, code: ERR_CODE.ALL_MODELS_FAILED, message: '模型调用全部失败：' + failures.join('；') + '，已保留你的原始输入。' })
          }
          // 剥离“待确认”段：仅供用户在 UI 里参考，不随正文发送给下游模型
          const parts = splitConfirmations(enhanced)
          enhanced = parts.text
          const confirmations = parts.confirmations
          if (!enhanced.trim()) {
            markRequest(record, 'failed', { revise, msg: '模型输出为空正文（仅含待确认段）' })
            return sendJson(res, { ok: false, code: ERR_CODE.EMPTY_OUTPUT, message: '模型未生成有效增强正文，请重试。' })
          }
          markRequest(record, 'ok', { revise, len: enhanced.length, conf: confirmations.length, model: usedModel })
          return sendJson(res, { ok: true, mode: modeId, enhanced, confirmations })
        } catch (e) {
          console.error('prompt-enhance failed', e)
          return sendJson(res, { ok: false, code: ERR_CODE.INTERNAL, message: '提示词增强失败：' + (e && e.message ? e.message : String(e)) })
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

export {
  name,
  inject,
  apply,
  // 内部逻辑导出（供 test/ 单元测试使用；不影响插件运行契约）
  resolveConfig,
  collectContext,
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
}
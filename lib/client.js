/**
 * prompt-enhance — Browser half (static profile plugin, hand-written in the
 * web module-loader bundle format; no build step).
 * v1.3.0 客户端：✦ 增强按钮（多模式：基础/标准/专家）+ 模式选择菜单 +
 * 增强结果对比面板（原文/增强后，采用或放弃）+ 采用后可撤回 +
 * 待确认问答闭环：待确认项逐条渲染为“问题 + 输入框”，支持「按回答重新增强」
 * （带答案二次请求 Host，修订增强正文）、「跳过确认，采用结果」；已填答案
 * 按问题指纹记忆在 localStorage，下次同类问题自动预填。空输入禁用。
 */

window.__ModuleLoader__.load({
  id: '@lidaxi/prompt-enhance',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
    const React = require('react')

    const PE_CSS =
      '.pe-shell{position:relative;display:inline-flex;align-items:center;gap:2px;flex:none}' +
      '.pe-btn{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;padding:0;border:none;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;transition:background .15s ease,color .15s ease;flex:none}' +
      '.pe-btn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}' +
      '.pe-btn:active:not(:disabled){background:var(--dsw-alias-bg-layer-1)}' +
      '.pe-btn:disabled{opacity:.55;cursor:default}' +
      '.pe-btn svg{display:block}' +
      '.pe-spin{animation:pe-spin .9s linear infinite}' +
      '@keyframes pe-spin{to{transform:rotate(360deg)}}' +
      // 模式选择按钮（✦ 左侧）
      '.pe-modebtn{display:inline-flex;align-items:center;gap:3px;height:26px;padding:0 6px;border:none;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);font-size:11.5px;line-height:1;cursor:pointer;transition:background .15s ease,color .15s ease;flex:none}' +
      '.pe-modebtn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}' +
      '.pe-modebtn:disabled{opacity:.55;cursor:default}' +
      '.pe-menu{position:absolute;bottom:calc(100% + 8px);right:0;min-width:170px;padding:4px;display:flex;flex-direction:column;gap:1px;background:var(--dsw-alias-bg-overlay);border:1px solid var(--dsw-alias-border-l1);border-radius:10px;box-shadow:0 8px 24px rgb(0 0 0/.16);z-index:70}' +
      '.pe-menu-item{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 10px;border:none;border-radius:7px;background:transparent;font-size:12.5px;text-align:left;color:var(--dsw-alias-label-primary);cursor:pointer}' +
      '.pe-menu-item:hover{background:var(--dsw-alias-bg-layer-2)}' +
      '.pe-menu-item.pe-active{color:var(--dsw-alias-state-success-primary);font-weight:600}' +
      '.pe-menu-item .pe-menu-hint{font-size:11px;color:var(--dsw-alias-label-secondary);font-weight:400}' +
      '.pe-check{color:var(--dsw-alias-state-success-primary);font-size:12px}' +
      // 浮动提示（原有）+ 带操作按钮的提示
      '.pe-overlay-notice{position:absolute;top:8px;left:50%;transform:translateX(-50%);max-width:min(380px,calc(100% - 32px));padding:6px 12px;border-radius:10px;font-size:12px;line-height:18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;background:var(--dsw-alias-bg-overlay);border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-primary);box-shadow:0 6px 18px rgb(0 0 0/.14);pointer-events:none;z-index:60}' +
      '.pe-overlay-notice.pe-error{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}' +
      '.pe-overlay-notice.pe-info{color:var(--dsw-alias-state-success-primary);border-color:var(--dsw-alias-state-success-primary)}' +
      '.pe-overlay-notice.pe-with-action{display:flex;align-items:center;gap:8px;pointer-events:auto}' +
      '.pe-undo-action{flex:none;padding:2px 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-size:12px;line-height:18px;cursor:pointer}' +
      '.pe-undo-action:hover{background:var(--dsw-alias-bg-layer-1)}' +
      // 对比面板
      '.pe-compare{position:absolute;bottom:calc(100% + 10px);left:50%;transform:translateX(-50%);width:min(720px,calc(100% - 24px));max-height:62vh;display:flex;flex-direction:column;background:var(--dsw-alias-bg-overlay);border:1px solid var(--dsw-alias-border-l1);border-radius:12px;box-shadow:0 12px 32px rgb(0 0 0/.18);z-index:70;overflow:hidden}' +
      '.pe-compare-head{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid var(--dsw-alias-border-l1);font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary)}' +
      '.pe-compare-cols{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--dsw-alias-border-l1);overflow:hidden;flex:1;min-height:0}' +
      '.pe-compare-col{background:var(--dsw-alias-bg-layer-1);padding:12px 14px;overflow:auto;max-height:40vh}' +
      '.pe-compare-col-title{font-size:11px;font-weight:600;color:var(--dsw-alias-label-secondary);margin-bottom:8px}' +
      '.pe-compare-text{font-size:13px;line-height:20px;white-space:pre-wrap;word-break:break-word;color:var(--dsw-alias-label-primary)}' +
      '.pe-compare-foot{display:flex;justify-content:flex-end;gap:8px;padding:10px 14px;border-top:1px solid var(--dsw-alias-border-l1)}' +
      // 待确认段（可逐条回答 + 按回答重新增强）
      '.pe-confirm{margin:10px 14px 0;padding:10px 12px;border-radius:8px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1)}' +
      '.pe-confirm-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px}' +
      '.pe-confirm-title{font-size:11.5px;font-weight:600;color:var(--dsw-alias-label-secondary)}' +
      '.pe-confirm-clear{flex:none;padding:0;border:none;background:none;color:var(--dsw-alias-label-secondary);font-size:11px;text-decoration:underline;cursor:pointer}' +
      '.pe-confirm-clear:hover{color:var(--dsw-alias-label-primary)}' +
      '.pe-confirm-item{padding:6px 0}' +
      '.pe-confirm-item + .pe-confirm-item{border-top:1px dashed var(--dsw-alias-border-l1)}' +
      '.pe-confirm-q{font-size:12px;line-height:1.55;white-space:pre-wrap;word-break:break-word;color:var(--dsw-alias-label-primary);margin-bottom:5px}' +
      '.pe-confirm-input{width:100%;box-sizing:border-box;min-height:54px;padding:6px 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:7px;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);font-size:12px;line-height:1.5;font-family:inherit;resize:vertical}' +
      '.pe-confirm-input:focus{outline:none;border-color:var(--dsw-alias-state-success-primary)}' +
      '.pe-confirm-hint{font-size:11px;line-height:1.5;color:var(--dsw-alias-label-secondary);margin-top:6px}' +
      '.pe-ghost{padding:5px 14px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);font-size:12.5px;cursor:pointer}' +
      '.pe-ghost:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}' +
      '.pe-primary{padding:5px 14px;border:none;border-radius:8px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-size:12.5px;font-weight:600;cursor:pointer}' +
      '.pe-primary:hover{background:var(--dsw-alias-bg-layer-1)}' +
      // 忙碌状态卡（含计时与取消）
      '.pe-busy{position:absolute;top:8px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:10px;padding:8px 14px;border-radius:12px;background:var(--dsw-alias-bg-overlay);border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-primary);box-shadow:0 8px 24px rgb(0 0 0/.16);z-index:70;pointer-events:auto;font-size:12.5px;white-space:nowrap}' +
      '.pe-busy-spin{animation:pe-spin .9s linear infinite;color:var(--dsw-alias-state-success-primary);display:inline-flex;flex:none}' +
      '.pe-busy-text{display:inline-flex;flex-direction:column;gap:2px;line-height:1.35;text-align:left}' +
      '.pe-busy-mode{font-weight:600}' +
      '.pe-busy-elapsed{font-size:11px;color:var(--dsw-alias-label-secondary)}' +
      '.pe-busy-cancel{flex:none;padding:4px 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:7px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-size:12px;cursor:pointer}' +
      '.pe-busy-cancel:hover{background:var(--dsw-alias-bg-layer-1)}' +
      // 会话内增强历史（轻量版）
      '.pe-history{margin:0 14px;padding:6px 0;border-top:1px solid var(--dsw-alias-border-l1)}' +
      '.pe-history-head{display:flex;align-items:center;justify-content:space-between;gap:8px}' +
      '.pe-history-toggle{flex:none;padding:0;border:none;background:none;color:var(--dsw-alias-label-secondary);font-size:11.5px;font-weight:600;cursor:pointer}' +
      '.pe-history-toggle:hover{color:var(--dsw-alias-label-primary)}' +
      '.pe-history-clear{flex:none;padding:0;border:none;background:none;color:var(--dsw-alias-label-secondary);font-size:11px;text-decoration:underline;cursor:pointer}' +
      '.pe-history-clear:hover{color:var(--dsw-alias-label-primary)}' +
      '.pe-history-list{max-height:112px;overflow:auto;margin-top:2px}' +
      '.pe-history-item{display:flex;align-items:center;gap:8px;padding:4px 2px;font-size:11.5px;line-height:1.4}' +
      '.pe-history-item + .pe-history-item{border-top:1px dashed var(--dsw-alias-border-l1)}' +
      '.pe-history-meta{flex:none;color:var(--dsw-alias-label-secondary);white-space:nowrap}' +
      '.pe-history-preview{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-primary)}' +
      '.pe-history-adopt{flex:none;padding:2px 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-size:11.5px;cursor:pointer}' +
      '.pe-history-adopt:hover{background:var(--dsw-alias-bg-layer-1)}'

    const MODES = [
      { id: 'basic', label: '基础', hint: '快速文本润色' },
      { id: 'standard', label: '标准', hint: '结合项目上下文' },
      { id: 'expert', label: '专家', hint: '深度上下文＋任务分析' },
    ]
    const MODE_KEY = 'dsh:plugin:prompt-enhance:mode'
    const modeLabel = (id) => {
      const m = MODES.find((x) => x.id === id)
      return m ? m.label : '标准'
    }
    function loadMode() {
      try {
        const m = localStorage.getItem(MODE_KEY)
        if (m && MODES.some((x) => x.id === m)) return m
      } catch (e) { /* ignore */ }
      return 'standard'
    }
    function saveMode(m) {
      try { localStorage.setItem(MODE_KEY, m) } catch (e) { /* ignore */ }
    }

    // ---- 错误码 → 用户可操作提示（Host 响应带 code 时优先映射，原始 message 保留到 console）----
    const ERR_HINTS = {
      EMPTY_DRAFT: '输入框为空，请先输入要增强的提示词。',
      BAD_BODY: '请求数据异常，请刷新页面后重试。',
      FS_UNAVAILABLE: '文件系统服务不可用，无法读取项目上下文；可切换为「基础」模式（不读取项目）。',
      NO_CWD: '当前会话未关联工作目录；请先打开一个项目工作区，或切换为「基础」模式。',
      NO_CONTEXT: '未能读取到项目上下文；确认工作目录可读后重试，或切换为「基础」模式。',
      LLM_UNAVAILABLE: '模型服务暂时不可用，请稍后重试。',
      NO_CANDIDATES: '未找到可用模型；请在 DSH 设置中配置模型后重试。',
      ALL_MODELS_FAILED: '增强服务暂时不可用：候选模型均调用失败。请检查网络/网关/模型配置后重试，或切换为「基础」模式。',
      EMPTY_OUTPUT: '模型未生成有效增强正文，请重试。',
      CANCELED: '已取消增强。',
      INTERNAL: '增强服务异常，请稍后重试或刷新页面。',
    }
    /**
     * 把 Host 错误码映射为用户可操作提示；未知码回退到 fallback。
     * @param {string|undefined|null} code Host 返回的错误码（ERR_CODE）
     * @param {string} [fallback] 兜底文案
     * @returns {string} 用户可操作提示
     */
    const friendlyError = (code, fallback) => (code && ERR_HINTS[code]) ? ERR_HINTS[code] : (fallback || '提示词增强失败，已保留原始输入。')

    // ---- 待确认问答闭环：回答记忆（按问题指纹预填）+ 清单解析 ----
    const ANSWERS_KEY = 'dsh:plugin:prompt-enhance:answers'
    // 模块级回答记忆：key=问题文本，value=用户上次填写的回答（localStorage 持久化）
    const answerMem = (() => {
      try {
        const raw = localStorage.getItem(ANSWERS_KEY)
        const parsed = raw ? JSON.parse(raw) : {}
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
      } catch (e) { return {} }
    })()
    const saveAnswerMem = () => {
      try { localStorage.setItem(ANSWERS_KEY, JSON.stringify(answerMem)) } catch (e) { /* ignore */ }
    }
    const clearAnswerMem = () => {
      for (const k of Object.keys(answerMem)) delete answerMem[k]
      saveAnswerMem()
    }
    /**
     * 把模型输出的待确认清单解析成逐条问题。支持 “- / * / • / 1.” 列表项，
     * 非列表行作为上一项的续行；无列表标记时整体作为一条问题。
     * @param {string} raw 待确认清单原文
     * @returns {Array<{question: string}>} 问题列表
     */
    const parseConfirmations = (raw) => {
      if (!raw || !raw.trim()) return []
      const items = []
      for (const line of raw.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed) continue
        const bullet = trimmed.match(/^(?:[-*•]|\d+[.)])(?:\s+(.*))?$/)
        if (bullet) {
          const q = bullet[1] ? bullet[1].trim() : ''
          // 空列表项（如单独的“-”）直接忽略，避免污染上一项作为续行
          if (q) items.push({ question: q })
        } else if (items.length > 0) {
          items[items.length - 1].question += '\n' + trimmed
        } else {
          items.push({ question: trimmed })
        }
      }
      return items.filter((x) => x.question)
    }

    // ---- 会话内增强历史（内存，上限 20 条；不持久化，避免隐私与体积问题）----
    const HISTORY_MAX = 20
    const enhanceHistory = []
    /**
     * 追加一条增强历史（每次成功增强/修订后调用）。
     * @param {{ts: number, mode: string, original: string, enhanced: string, confirmations: string}} entry 历史条目
     * @returns {number} 当前历史条数
     */
    const pushHistory = (entry) => {
      enhanceHistory.push(entry)
      if (enhanceHistory.length > HISTORY_MAX) enhanceHistory.shift()
      return enhanceHistory.length
    }
    /**
     * 返回历史快照（新 → 旧，#1 为最新）。
     * @returns {Array<{ts: number, mode: string, original: string, enhanced: string, confirmations: string}>} 历史条目
     */
    const listHistory = () => enhanceHistory.slice().reverse()
    /** 清空会话内历史。 */
    const clearHistory = () => { enhanceHistory.length = 0 }

    const inject = ['slots']

    /**
     * 浏览器半主入口：注入样式、错误上报与状态机，并向两个输入槽位注册 UI
     * （conversation.input.right 模式选择 + ✦ 按钮；conversation.input.overlay 对比面板）。
     * @param {import('../typings/dsh.d.ts').DshClientCtx} ctx Cordis 注入上下文（slots/timer）
     */
    function apply(ctx) {
      ctx.effect(() => {
        const style = document.createElement('style')
        style.setAttribute('data-prompt-enhance', '')
        style.textContent = PE_CSS
        document.head.appendChild(style)
        return () => { if (style.parentNode) style.parentNode.removeChild(style) }
      }, 'prompt-enhance: styles')

      // 浏览器端错误捕获：上报 Host 诊断环（排查“转圈后不可用”）
      ctx.effect(() => {
        const onErr = (ev) => {
          const msg = ev && ev.message ? ev.message : (ev && ev.reason ? String(ev.reason) : String(ev))
          const err = ev && ev.error ? ev.error : (ev && ev.reason ? ev.reason : null)
          const stack = err && err.stack ? String(err.stack).slice(0, 800) : ''
          try {
            fetch('/api/prompt-enhance/log-error', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ msg: String(msg).slice(0, 400), stack }),
            })
          } catch (e) { /* ignore */ }
        }
        window.addEventListener('error', onErr)
        window.addEventListener('unhandledrejection', onErr)
        return () => {
          window.removeEventListener('error', onErr)
          window.removeEventListener('unhandledrejection', onErr)
        }
      }, 'prompt-enhance: error trap')

      // 共享状态机：idle / busy / compare / undo / notice
      let current = null
      let dismissHandle = null
      let undoHandle = null
      const listeners = new Set()
      const notify = () => { for (const fn of listeners) fn() }
      const timer = ctx.get('timer')
      const clearTimers = () => {
        if (dismissHandle) { dismissHandle(); dismissHandle = null }
        if (undoHandle) { undoHandle(); undoHandle = null }
      }
      const publish = (state) => {
        clearTimers()
        current = { seq: (current ? current.seq : 0) + 1, ...state }
        // 定时器失败绝不阻塞状态推进（否则 UI 会冻结在上一个状态）
        try {
          if (current.phase === 'notice') {
            dismissHandle = timer ? timer.timeout(() => { current = null; notify() }, 3600) : null
          } else if (current.phase === 'undo') {
            undoHandle = timer ? timer.timeout(() => { current = null; notify() }, 9000) : null
          }
        } catch (e) {
          console.error('prompt-enhance timer failed', e)
        }
        notify()
      }
      const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn) }

      // 当前进行中的增强请求（用于取消）
      let activeAbort = null
      const cancelEnhance = () => { if (activeAbort) activeAbort.abort() }

      // 实时草稿镜像：RightControls 每次渲染写入（overlay 槽无 input 属性，改用镜像，
      // 不在 overlay 调用 useInput 钩子，避免钩子不可用时整个输入区崩溃）
      const draftMirror = { value: null }

      /**
       * 调用 Host 路由发起增强请求（支持取消；中断时 abort 服务端流式调用）。
       * @param {object} props 槽位属性（input/inputActions/sessionId）
       * @param {string} mode 增强模式 id（basic/standard/expert）
       */
      const runEnhance = async (props, mode) => {
        const draft = (props.input && props.input.draft) || ''
        if (!draft.trim()) {
          publish({ phase: 'notice', kind: 'error', text: '输入框为空：请先输入要增强的提示词。' })
          return
        }
        const original = draft
        const ctrl = new AbortController()
        activeAbort = ctrl
        publish({ phase: 'busy', mode, text: '正在增强（' + modeLabel(mode) + '）…' })
        try {
          const response = await fetch('/api/prompt-enhance/enhance', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ sessionId: props.sessionId, draft, mode }),
            signal: ctrl.signal,
          })
          let result = null
          try { result = await response.json() } catch (e) { result = null }
          if (result && result.ok && typeof result.enhanced === 'string' && result.enhanced) {
            pushHistory({ ts: Date.now(), mode, original, enhanced: result.enhanced, confirmations: (result.confirmations || '').trim() })
            publish({ phase: 'compare', mode, original, enhanced: result.enhanced, confirmations: (result.confirmations || '').trim() })
          } else if (result && result.canceled) {
            publish({ phase: 'notice', kind: 'info', text: '已取消增强。' })
          } else {
            const code = result && result.code
            console.error('prompt-enhance failed', code, result && result.message)
            publish({ phase: 'notice', kind: 'error', text: friendlyError(code, (result && result.message) || '提示词增强失败，已保留原始输入。') })
          }
        } catch (e) {
          if (ctrl.signal.aborted) {
            publish({ phase: 'notice', kind: 'info', text: '已取消增强。' })
          } else {
            console.error('prompt-enhance rpc failed', e)
            publish({ phase: 'notice', kind: 'error', text: '网络异常或增强服务不可用，请检查网络后重试。' })
          }
        } finally {
          if (activeAbort === ctrl) activeAbort = null
        }
      }

      /**
       * 带答案的第二次增强：把用户对“待确认项”的回答发回 Host，修订增强正文。
       * 草稿被改过则中止（与 adopt 同一保护）；回答写入 answerMem 供下次预填。
       * @param {object} props 槽位属性（sessionId）
       * @param {string} mode 增强模式 id
       * @param {Array<{question: string, answer: string}>} answers 已填写的回答
       */
      const runRevise = async (props, mode, answers) => {
        const s = current
        if (!s || s.phase !== 'compare') return
        const nowDraft = draftMirror.value
        if (nowDraft !== null && nowDraft.trim() !== s.original.trim()) {
          publish({ phase: 'notice', kind: 'error', text: '增强期间输入框内容已变化，未能按回答修订（请先恢复原文再重试）。' })
          return
        }
        const filled = (Array.isArray(answers) ? answers : [])
          .filter((x) => x && x.question && String(x.answer || '').trim())
        if (filled.length === 0) {
          publish({ phase: 'notice', kind: 'error', text: '请至少填写一条确认信息后再重新增强。' })
          return
        }
        for (const a of filled) answerMem[a.question] = String(a.answer).trim()
        saveAnswerMem()
        const ctrl = new AbortController()
        activeAbort = ctrl
        publish({ phase: 'busy', mode, text: '正在按确认信息修订（' + modeLabel(mode) + '）…' })
        try {
          const response = await fetch('/api/prompt-enhance/enhance', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              sessionId: props.sessionId,
              draft: s.original,
              mode,
              answers: filled.map((a) => ({ question: a.question, answer: a.answer })),
              baseEnhanced: s.enhanced,
            }),
            signal: ctrl.signal,
          })
          let result = null
          try { result = await response.json() } catch (e) { result = null }
          if (result && result.ok && typeof result.enhanced === 'string' && result.enhanced) {
            pushHistory({ ts: Date.now(), mode, original: s.original, enhanced: result.enhanced, confirmations: (result.confirmations || '').trim() })
            publish({ phase: 'compare', mode, original: s.original, enhanced: result.enhanced, confirmations: (result.confirmations || '').trim() })
          } else if (result && result.canceled) {
            publish({ phase: 'notice', kind: 'info', text: '已取消修订。' })
          } else {
            const code = result && result.code
            console.error('prompt-enhance revise failed', code, result && result.message)
            publish({ phase: 'notice', kind: 'error', text: friendlyError(code, (result && result.message) || '修订失败，已保留上一版增强结果。') })
          }
        } catch (e) {
          if (ctrl.signal.aborted) {
            publish({ phase: 'notice', kind: 'info', text: '已取消修订。' })
          } else {
            console.error('prompt-enhance revise failed', e)
            publish({ phase: 'notice', kind: 'error', text: '网络异常或增强服务不可用，请检查网络后重试。' })
          }
        } finally {
          if (activeAbort === ctrl) activeAbort = null
        }
      }

      const adopt = (props) => {
        const s = current
        if (!s || s.phase !== 'compare') return
        // 实时草稿来自 draftMirror（RightControls 渲染时写入）。镜像为空时退化为直接采用。
        const nowDraft = draftMirror.value
        if (nowDraft !== null && nowDraft.trim() !== s.original.trim()) {
          publish({ phase: 'notice', kind: 'error', text: '增强期间输入框内容已变化，增强结果未覆盖（可再次点击重试）。' })
          return
        }
        if (props.inputActions) {
          props.inputActions.setDraft(s.enhanced)
          publish({ phase: 'undo', original: s.original, text: '已采用增强结果' })
        } else {
          publish({ phase: 'notice', kind: 'error', text: '输入框不可写，无法写入增强结果。' })
        }
      }

      const discard = () => {
        publish({ phase: 'notice', kind: 'info', text: '已放弃增强结果，保留原输入。' })
      }

      const undoAction = (props) => {
        const s = current
        if (!s || s.phase !== 'undo' || !s.original) return
        if (props.inputActions) props.inputActions.setDraft(s.original)
        publish({ phase: 'notice', kind: 'info', text: '已撤回原文。' })
      }

      /**
       * 采用一条历史版本：写入输入框并进入 undo 状态（可用「撤回」恢复该版本的原文）。
       * 草稿被改过则中止，与 adopt 同一保护。
       * @param {object} props 槽位属性（inputActions）
       * @param {{original: string, enhanced: string}} entry 历史条目
       */
      const adoptVersion = (props, entry) => {
        const nowDraft = draftMirror.value
        if (nowDraft !== null && nowDraft.trim() !== entry.original.trim()) {
          publish({ phase: 'notice', kind: 'error', text: '输入框内容已变化，历史版本未覆盖（可恢复原文后再试）。' })
          return
        }
        if (props.inputActions) {
          props.inputActions.setDraft(entry.enhanced)
          publish({ phase: 'undo', original: entry.original, text: '已采用历史版本' })
        } else {
          publish({ phase: 'notice', kind: 'error', text: '输入框不可写，无法写入历史版本。' })
        }
      }

      // ---- conversation.input.right：模式选择 + ✦ 增强按钮 ----
      ctx.slots.inject('conversation.input.right', () => ctx.slots.register(
        { name: 'conversation.input.right', id: 'prompt-enhance', order: 0, label: '提示词增强' },
        (props) => {
          const [, setTick] = React.useState(0)
          const [mode, setMode] = React.useState(loadMode)
          const [menuOpen, setMenuOpen] = React.useState(false)
          const wrapRef = React.useRef(null)
          React.useEffect(() => subscribe(() => setTick((t) => t + 1)), [])
          const phase = props.input ? props.input.phase : 'plain'
          const draft = (props.input && props.input.draft) || ''
          // 镜像最新草稿（右槽随输入 store 变化重渲染，adopt 用它做变化检测）
          if (props.input && typeof props.input.draft === 'string') draftMirror.value = props.input.draft
          const busy = !!(current && current.phase === 'busy')
          const disabled = busy || phase !== 'plain' || !draft.trim()

          React.useEffect(() => {
            if (!menuOpen) return
            const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setMenuOpen(false) }
            document.addEventListener('pointerdown', onDown)
            return () => document.removeEventListener('pointerdown', onDown)
          }, [menuOpen])

          // 全局快捷键：Ctrl/Cmd+Shift+E 触发增强（与点击 ✦ 等价；ref 避免重复绑定监听）
          const enhancePropsRef = React.useRef(props)
          enhancePropsRef.current = props
          const enhanceModeRef = React.useRef(mode)
          enhanceModeRef.current = mode
          const enhanceDisabledRef = React.useRef(disabled)
          enhanceDisabledRef.current = disabled
          React.useEffect(() => {
            const onKey = (e) => {
              if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'E' || e.key === 'e')) {
                e.preventDefault()
                if (!enhanceDisabledRef.current) runEnhance(enhancePropsRef.current, enhanceModeRef.current)
              }
            }
            window.addEventListener('keydown', onKey)
            return () => window.removeEventListener('keydown', onKey)
          }, [])

          const choose = (id) => {
            setMode(id)
            saveMode(id)
            setMenuOpen(false)
            // 对比面板打开时只更新选择，不覆盖进行中的 compare 状态，避免未采用结果丢失
            if (current && current.phase === 'compare') return
            publish({ phase: 'notice', kind: 'info', text: '增强模式已切换为：' + modeLabel(id) })
          }

          const caret = React.createElement('svg', { viewBox: '0 0 16 16', width: '10', height: '10', 'aria-hidden': true },
            React.createElement('path', { d: 'M4 6l4 4 4-4', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.5', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }))
          const spinner = React.createElement('svg', { className: 'pe-spin', viewBox: '0 0 16 16', width: '15', height: '15', 'aria-hidden': true },
            React.createElement('path', { d: 'M8 1.5a6.5 6.5 0 1 0 6.5 6.5H13A5 5 0 1 1 8 3V1.5z', fill: 'currentColor' }))
          const star = React.createElement('svg', { viewBox: '0 0 16 16', width: '15', height: '15', 'aria-hidden': true },
            React.createElement('path', { d: 'M9.245 2.5a.75.75 0 0 1 .51.37l1.1 2.17 2.17 1.1a.75.75 0 0 1 0 1.38l-2.17 1.1-1.1 2.17a.75.75 0 0 1-1.38 0l-1.1-2.17-2.17-1.1a.75.75 0 0 1 0-1.38l2.17-1.1 1.1-2.17a.75.75 0 0 1 .77-.37zm2.255 9.5a.75.75 0 0 1 .71.51l.4 1.08 1.08.4a.75.75 0 0 1 0 1.42l-1.08.4-.4 1.08a.75.75 0 0 1-1.42 0l-.4-1.08-1.08-.4a.75.75 0 0 1 0-1.42l1.08-.4.4-1.08a.75.75 0 0 1 .71-.51z', fill: 'currentColor' }))

          return React.createElement('div', { className: 'pe-shell', ref: wrapRef },
            React.createElement('button', {
              type: 'button',
              className: 'pe-modebtn',
              disabled: busy,
              title: '增强模式：' + modeLabel(mode) + '（点击切换）',
              'aria-label': '选择提示词增强模式',
              'aria-expanded': menuOpen,
              onClick: () => setMenuOpen(!menuOpen),
            },
            React.createElement('span', null, modeLabel(mode)),
            caret
            ),
            menuOpen && React.createElement('div', { className: 'pe-menu', role: 'menu' },
              MODES.map((m) => React.createElement('button', {
                key: m.id,
                type: 'button',
                role: 'menuitem',
                className: 'pe-menu-item' + (m.id === mode ? ' pe-active' : ''),
                onClick: () => choose(m.id),
              },
              React.createElement('span', null,
                React.createElement('span', null, m.label),
                React.createElement('span', { className: 'pe-menu-hint' }, '  ' + m.hint)
              ),
              m.id === mode ? React.createElement('span', { className: 'pe-check' }, '✓') : null
              ))
            ),
            React.createElement('button', {
              type: 'button',
              className: 'pe-btn',
              'aria-label': '提示词增强：读取项目上下文并重写输入框中的提示词',
              title: '提示词增强（' + modeLabel(mode) + '）：结合项目上下文重写输入框中的提示词',
              disabled,
              onClick: () => runEnhance(props, mode),
            }, busy ? spinner : star)
          )
        }
      ))

      // ---- conversation.input.overlay：对比面板 / 撤回提示 / 状态提示 ----
      ctx.slots.inject('conversation.input.overlay', () => ctx.slots.register(
        { name: 'conversation.input.overlay', id: 'prompt-enhance-notice', order: 0, label: '提示词增强提示' },
        (props) => {
          const [s, setS] = React.useState(current ? { ...current } : null)
          const [histOpen, setHistOpen] = React.useState(false)
          React.useEffect(() => subscribe(() => setS(current ? { ...current } : null)), [])
          // 回答记忆变化触发重渲染（answerMem 是模块级对象，不经过 setState）
          const [, setMemTick] = React.useState(0)
          const [elapsed, setElapsed] = React.useState(0)
          React.useEffect(() => {
            if (!s || s.phase !== 'busy') { setElapsed(0); return }
            const started = Date.now()
            setElapsed(0)
            const t = ctx.get('timer')
            if (!t) return
            let fired = false
            const h = t.interval(() => {
              if (fired) return
              const secs = Math.floor((Date.now() - started) / 1000)
              setElapsed(secs)
              if (secs >= 120) {
                fired = true
                h()
                if (activeAbort) activeAbort.abort()
                publish({ phase: 'notice', kind: 'error', text: '增强超时（>120 秒），已取消。请重试。' })
              }
            }, 1000)
            return h
          }, [s ? s.seq : 0])

          // 对比面板快捷键：Esc 放弃、Enter 采用（焦点在 textarea/input 时 Enter 跳过，
          // 避免与确认回答的 Enter 提交冲突；Escape 始终生效）
          const comparePropsRef = React.useRef(props)
          comparePropsRef.current = props
          React.useEffect(() => {
            if (!s || s.phase !== 'compare') return
            const onKey = (e) => {
              if (e.key === 'Escape') {
                e.preventDefault()
                discard()
                return
              }
              if (e.key !== 'Enter') return
              const t = e.target
              if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.isContentEditable)) return
              e.preventDefault()
              adopt(comparePropsRef.current)
            }
            window.addEventListener('keydown', onKey)
            return () => window.removeEventListener('keydown', onKey)
          }, [s ? s.seq : 0])
          if (!s) return null

          if (s.phase === 'compare') {
            const confirmItems = parseConfirmations(s.confirmations)
            const collectAnswers = () => confirmItems.map((it) => ({ question: it.question, answer: answerMem[it.question] || '' }))
            const confirm = confirmItems.length > 0 ? React.createElement('div', { className: 'pe-confirm' },
              React.createElement('div', { className: 'pe-confirm-head' },
                React.createElement('div', { className: 'pe-confirm-title' }, '待确认事项（回答后可重新增强，不会写入正文）'),
                React.createElement('button', { type: 'button', className: 'pe-confirm-clear', onClick: () => { clearAnswerMem(); setMemTick((t) => t + 1) } }, '清除已记住的回答')
              ),
              React.createElement('div', null,
                confirmItems.map((item) => React.createElement('div', { key: item.question, className: 'pe-confirm-item' },
                  React.createElement('div', { className: 'pe-confirm-q' }, item.question),
                  React.createElement('textarea', {
                    className: 'pe-confirm-input',
                    rows: '2',
                    placeholder: '填写你的确认…',
                    value: answerMem[item.question] || '',
                    onChange: (e) => { answerMem[item.question] = e.target.value; setMemTick((t) => t + 1) },
                    onKeyDown: (e) => {
                      // Enter 快速提交（Shift+Enter 换行）
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        runRevise(props, s.mode, collectAnswers())
                      }
                    },
                  })
                ))
              ),
              React.createElement('div', { className: 'pe-confirm-hint' }, '填写后点「按回答重新增强」：模型会把确认信息修订进增强正文；填过的回答会在下次同类问题时自动预填。')
            ) : null
            const historyList = listHistory()
            const historyBlock = historyList.length > 0 ? React.createElement('div', { className: 'pe-history' },
              React.createElement('div', { className: 'pe-history-head' },
                React.createElement('button', { type: 'button', className: 'pe-history-toggle', onClick: () => setHistOpen(!histOpen) }, '历史版本（' + historyList.length + '）' + (histOpen ? ' ▴' : ' ▾')),
                React.createElement('button', { type: 'button', className: 'pe-history-clear', onClick: () => { clearHistory(); setHistOpen(false) } }, '清空')
              ),
              histOpen && React.createElement('div', { className: 'pe-history-list' },
                historyList.map((h, i) => {
                  const num = i + 1
                  const time = new Date(h.ts).toLocaleTimeString('zh-CN', { hour12: false })
                  const preview = h.enhanced.length > 60 ? h.enhanced.slice(0, 60) + '…' : h.enhanced
                  return React.createElement('div', { key: h.ts + '-' + num, className: 'pe-history-item' },
                    React.createElement('span', { className: 'pe-history-meta' }, '#' + num + ' · ' + modeLabel(h.mode) + ' · ' + time),
                    React.createElement('span', { className: 'pe-history-preview' }, preview),
                    React.createElement('button', { type: 'button', className: 'pe-history-adopt', onClick: () => adoptVersion(props, h) }, '采用')
                  )
                })
              )
            ) : null
            return React.createElement('div', { key: s.seq, className: 'pe-compare', role: 'dialog', 'aria-label': '提示词增强结果对比' },
              React.createElement('div', { className: 'pe-compare-head' },
                React.createElement('span', null, '增强结果对比（' + modeLabel(s.mode) + '）')
              ),
              React.createElement('div', { className: 'pe-compare-cols' },
                React.createElement('div', { className: 'pe-compare-col' },
                  React.createElement('div', { className: 'pe-compare-col-title' }, '原文'),
                  React.createElement('div', { className: 'pe-compare-text' }, s.original)
                ),
                React.createElement('div', { className: 'pe-compare-col' },
                  React.createElement('div', { className: 'pe-compare-col-title' }, '增强后'),
                  React.createElement('div', { className: 'pe-compare-text' }, s.enhanced)
                )
              ),
              confirm,
              historyBlock,
              React.createElement('div', { className: 'pe-compare-foot' },
                React.createElement('button', { type: 'button', className: 'pe-ghost', onClick: () => discard() }, '放弃'),
                confirmItems.length > 0
                  ? React.createElement(React.Fragment, null,
                    React.createElement('button', { type: 'button', className: 'pe-ghost', onClick: () => adopt(props) }, '跳过确认，采用结果'),
                    React.createElement('button', { type: 'button', className: 'pe-primary', onClick: () => runRevise(props, s.mode, collectAnswers()) }, '按回答重新增强')
                  )
                  : React.createElement('button', { type: 'button', className: 'pe-primary', onClick: () => adopt(props) }, '采用增强结果')
              )
            )
          }

          if (s.phase === 'undo') {
            return React.createElement('div', { key: s.seq, role: 'status', className: 'pe-overlay-notice pe-info pe-with-action' },
              React.createElement('span', null, s.text),
              React.createElement('button', { type: 'button', className: 'pe-undo-action', onClick: () => undoAction(props) }, '↩ 撤回')
            )
          }

          if (s.phase === 'busy') {
            const spin = React.createElement('svg', { className: 'pe-busy-spin', viewBox: '0 0 16 16', width: '16', height: '16', 'aria-hidden': true },
              React.createElement('path', { d: 'M8 1.5a6.5 6.5 0 1 0 6.5 6.5H13A5 5 0 1 1 8 3V1.5z', fill: 'currentColor' }))
            return React.createElement('div', { key: s.seq, role: 'status', className: 'pe-busy' },
              spin,
              React.createElement('span', { className: 'pe-busy-text' },
                React.createElement('span', { className: 'pe-busy-mode' }, s.text),
                React.createElement('span', { className: 'pe-busy-elapsed' }, '已用时 ' + elapsed + ' 秒，可稍候或取消')
              ),
              React.createElement('button', { type: 'button', className: 'pe-busy-cancel', onClick: cancelEnhance }, '取消')
            )
          }

          return React.createElement('div', { key: s.seq, role: 'status', className: 'pe-overlay-notice pe-' + s.kind }, s.text)
        }
      ))
    }

    exports.apply = apply
    exports.inject = inject
    // 纯逻辑导出（供 test/ 单元测试使用；不影响插件运行契约）
    exports.parseConfirmations = parseConfirmations
    exports.friendlyError = friendlyError
    exports.ERR_HINTS = ERR_HINTS
    exports.MODES = MODES
    exports.pushHistory = pushHistory
    exports.listHistory = listHistory
    exports.clearHistory = clearHistory
    return module.exports
  }
})
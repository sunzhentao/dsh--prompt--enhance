# Changelog

所有显著更改都将记录在此文件中。

## [1.5.2] - 2026-10-10

桌面版 0.2.0-rc.2 契约体检批（Host 半 + 浏览器半各一轮对照 `app.asar` 真实代码的审计）后的修复与加固。

### 加固（安全）

- **三条路由绕过宿主的 `/api` 围栏**：它们是 `webServer` 上的 **exact** 注册，而 DSH 的 `/api` 围栏是 **prefix** 路由——`dsh-host-webserver` 的 `match()` 先查 exact 表、命中即返回，围栏根本看不到它们。实测（对运行中的 0.2.0-rc.2）：带 `Origin: https://evil.example` + `Sec-Fetch-Site: cross-site` 的 `POST /api/prompt-enhance/enhance` 返回 **200**（handler 已执行，可被迫读项目文件并远端调用模型），而同头的 `/api/gateway/*` 是 **403**。
  - `POST /enhance`、`POST /log-error` 现在每请求调用宿主的 `connection.requestRejection`（官方 API，就是 `/api` 围栏那套 Host/Origin 同源校验 + 浏览器 cookie 认证）；**必须惰性读取**——`connection` 由宿主在 `await BrowserAuth.create(...)` 之后才 provide，mount 时读永远是 undefined（dshmarket #729 踩过同一个坑）。门禁抛错一律 **fail closed**（403）。
  - 宿主没有该服务时（老版本）回退到同规则的本机校验：Host 存在时必须回环、`sec-fetch-site` 不得为 `cross-site`、Origin 存在时必须与 Host 同源；Host 缺失时放行（桌面版转发层会剥掉 Host/Origin/cookie 再自己注入 cookie，不能因此误伤）。
  - `GET /log` 只走 Host/Origin 围栏、不要求 cookie：读接口不改状态、跨源页面也读不到响应体（无 CORS），真正的威胁是 DNS rebinding，那由 Host 围栏挡住；要求 cookie 只会让本机脚本（含本插件的诊断流程）再也读不到诊断环。
- **跨站"简单请求"**：POST 若带非 JSON 的 `content-type`（表单 / `text/plain`）直接 415，挡掉无需预检的跨站表单提交。
- **超大请求体**：>1MB 时不再 `req.destroy()`（客户端只看到连接重置、桌面版转发必然失败），改为停止累积并正常应答 **413** 结构化错误。
- **单次调用成本上限**：草稿超过 20000 字符直接 `BAD_BODY`。
- **单条路由注册冲突不再一损俱损**：`webServer.register` 对重复 `(kind,path)` 会 throw，而 effect 体抛错会让整个 fiber 回滚（三条路由一起消失）；现在每条独立 try/catch，失败的只记进诊断环。
- 响应统一带 `cache-control: no-store`。

### 修复

- **重试阶梯在 0.2.0 下方向相反**：省略 `reasoningEffort` 不等于关推理——宿主会用模型默认档位补齐（`dsh-llm` 的 `requested ?? reasoning.defaultEffort`，deepseek 未配置时默认 `high`）。于是「空输出恢复」实际是把推理调更高，「去档位重试」对专家模式（本来就是 `high`）等于把同一请求再发一遍、只让计费翻倍。现在：空输出（含 0.2.0 官方适配器把「正常停止但零内容」抛出的 `EMPTY_RESPONSE`）→ **显式发 `'off'` + 加大预算**；只有「档位参数确实被拒」（`UNSUPPORTED_REASONING_EFFORT`、400 回显 effort/thinking、`developer` 角色不被接受）才去掉参数重试；限流/网络等无关失败不再重发。配置文档同步澄清 `effort: 'none'` 的真实语义是「不带该参数、由宿主按模型默认决定」。
- **增强用的是全局默认模型而非会话当前模型**：0.2.0 的会话选择记录在 `request/header` 事件里（宿主优先读 `session.requestHeader().config`，只在还没落过 header 时才用全局默认）。恢复/分叉的历史会话与全局默认不一致时，用户界面显示一个模型、增强却用另一个。候选链顺序改为：`config.candidates` → **会话当前模型** → 全局默认 → 自动补足。

- **跨会话状态串扰（真数据错乱风险）**：两个槽位都是 `scope: 'session'`，DSH renderer 切会话时按 `sessionGenerationKey` remount 条目（`dsh-client-ui-renderer` 里 `StrictSessionEntry` 的 key），但插件把 `current`/`draftMirror`/`activeAbort` 放在 `apply()` 闭包里跨会话共享。后果：甲会话的对比面板/撤回提示会显示在乙会话的输入框上，点「撤回」会把**甲会话的原文写进乙会话的输入框**。
- **多 composer 并存时的互相清空**：同一文档可能同时挂载两个 composer（右侧栏子智能体聊天 = `ui-subagent` 用 `renderFactorySlot("conversation.content", {variant:"embedded"})` 再渲一份），共享状态会被另一个 composer 的渲染覆盖（草稿镜像串、变更检测按错会话假报错）。
  - 上两条统一改为**状态按 `sessionId` 分桶**（`seatOf(sessionId)`，最多缓存 8 个会话位）：提示/对比面板/草稿镜像/输入阶段/在途请求/定时器全部随会话隔离，互不串、互不清。会话历史 `listHistory(sessionId)` 也按会话过滤（此前标着「会话内」实为全局，能在乙会话里采用甲会话的版本）。
- **Esc 会连「停止本轮」一起触发**：宿主把 `Escape` 注册成固定命令 `response.stop`（`ui-conversation`），它的分发器先消费该键，插件的 `preventDefault()` 拦不住 → 面板打开且 turn 在跑时按 Esc 既停 turn 又丢弃增强结果。现在 `e.defaultPrevented` 为真时不再放弃结果。
- **Enter 抢走按钮激活**：焦点在「放弃/采用/历史版本采用」等按钮上按 Enter，原本会被插件抢成「采用当前结果」（`<button>` 的 Enter 激活被 `preventDefault` 取消）。现在焦点落在 `button`/`a`/`menuitem`/`role=button` 上时不抢键。
- **快捷键更稳**：改用物理 `e.code === 'KeyE'`（原来用 `e.key`，非 QWERTY 或中文输入法下可能静默失效），并加 `e.repeat`/`e.isComposing` 门控；`preventDefault()` 只在真正要触发增强时执行（空草稿/忙碌/非 plain 时不再吞掉这个组合）；多 composer 时按焦点路由，避免一次按键触发两次增强。
- **写入草稿缺少阶段守卫**：宿主 `inputActions.setDraft` 没有任何守卫（同一对象的 `insertText` 才会拒绝 `adjudicating`/`submitting`），插件可能把增强结果盖到正在提交的草稿上。现在渲染期镜像 `input.phase`，非 `plain` 时拒绝写入。
- **拒绝采纳不再丢面板**：写回被拒（阶段不对/草稿被改过）此前用 `publish({phase:'notice'})`，会把对比面板整个顶掉——用户因为一句话就白跑一次增强。改为**面板内提示**（`.pe-hint`，4.2 秒后自清），面板与增强结果保留，用户改回原样后可直接再点「采用」。
- **提示框/忙碌卡压住草稿首行**：`overlayAnchor` 是零高度贴顶锚点，原来 `top:8px` 正好落在卡片 `padding-top:8px` 之后的草稿第一行上（忙碌卡还带 `pointer-events:auto`，会吃掉首行点击）。两者改为 `bottom: calc(100% + 10px)`，与对比面板一样浮在卡片上方。
- **错误上报自激**：上报用的 `try { fetch(...) } catch {}` 捕不到 Promise rejection，上报失败本身会再触发 `unhandledrejection` → 再上报。改为 `fetch(...).catch(() => {})`。
- **槽位注册的 disposer 被丢弃**：`ui-renderer` 的 `slots.register/inject` 内部把 effect 记在 registry 自己的 ctx 上，不接住返回值会导致卸载/HMR 后槽位条目残留。两个注册都收进 `ctx.effect(...)`。

### 工程

- `test/client.test.js`：假 window 现在记录监听器（可直接派发键盘事件）；新增「会话隔离」「多 composer 并存」「写草稿阶段守卫」「Esc/Enter 键盘边界」4 个用例。
- `test/enhance.integration.test.js`：新增 8 个用例覆盖路由门禁（跨站/非同源/非回环/rebinding Host/401/fail-closed/非 JSON content-type）、413、草稿上限、单条路由注册失败隔离、会话当前模型优先。
- `test/index.test.js`：新增重试阶梯 4 个用例（`EMPTY_RESPONSE` 走关推理加大预算且真的发 `off`、无关失败不重发、`effort: none` 不发参数）。
- 测试总数 55 → 70。关键用例都做过反向实验：把状态退化成全局单例 → 7 红；把门禁短路 → 4 红。

## [1.5.1] - 2026-10-09

桌面版客户端（0.2.0-rc.2）下 ✦ 按钮不可点击、切换模式后提示框不消失的修复。

### 修复

- **✦ 按钮恒为禁用（宿主契约变更）**：DSH **0.1.2-rc.1** 起 `conversation.input.right/left/overlay` 的 owner props 变为空，输入态改由 session 标准钩子 `useInput` 提供（`inputActions` 仍是普通 prop）；此前（≤0.1.1）传的是 `{ session, input }`。插件只读 `props.input`，在 0.1.2-rc.1 之后 `draft` 恒为空、`phase` 恒为 `plain`，于是 ✦ 按钮永远处于禁用态。新增 `readInputState()` 统一两种契约（优先 `useInput` 钩子，旧宿主回退 `props.input`）；事件处理器里不能调钩子，改为读取右槽渲染时维护的草稿镜像（`runEnhance`）。
- **提示框永不消失（定时器缺失）**：`apply()` 里一次性 `ctx.get('timer')` 后判空即等于「永不超时」——0.1.x 客户端根本没有该服务，0.2.x 只在动态包 runner 的组合里提供且可能尚未就绪，于是「增强模式已切换为…」提示框、采用后的撤回提示会一直挂在输入框上，忙碌卡也不再有已用时/120 秒超时。改为惰性获取宿主 `timer`，取不到就回退浏览器 `setTimeout`/`setInterval`；普通提示框同时支持**点击关闭**，任何定时器路径失效时用户都能一键清掉。

### 工程

- `test/client.test.js` 增加迷你 hooks 运行时，槽位组件可真实渲染，新增 6 个宿主契约回归用例（按钮可用性、空草稿/提交中禁用、旧契约回退、无 timer 时提示框仍自动消失、点击关闭提示框）；测试总数 49 → 55。新增 `readInputState` 导出与 `typings/dsh.d.ts` 的槽位 props 类型（`DshInputState` / `DshInputActions` / `DshInputSlotProps`）。已验证这些用例在修复前的 `lib/client.js` 上失败（4 个红）。

## [1.5.0] - 2026-08-29

### 新增

- **会话历史上下文**：标准/专家模式自动把当前会话最近 3 轮的「用户问题 → 助手结论」配对压缩后随增强请求带上（只保留人话问答与助手正文，工具结果/插件注入默认过滤；`deriveMessages` 特性检测，老版本静默降级；`historyTurns: 0` 可关闭）。
- **智能项目上下文**：`collectContext` 改为按草稿关键词命中度分配读取预算（命中文件优先占 `contentChars`），目录树不再被内容预算中途截断；项目根存在 `AGENTS.md` 时作为项目事实块优先读取（单文件 4000 字符上限），不写任何文件。
- 配置新增 `historyTurns` / `historyChars`（basic 默认 0/0，standard 3/6000，expert 3/9000，`≥0` 裁剪）；诊断环请求记录新增 `historyChars`。

## [1.4.0] - 2026-08-29

### 功能

- **会话内增强历史（轻量版）**：每次成功增强/修订的结果自动记入会话内历史（内存，上限 20 条，刷新页面即清空）；对比面板新增「历史版本」折叠区，可一键采用任一历史版本（沿用原文变更保护，采用后仍可撤回），支持一键清空历史。
- **待确认清单解析健壮性**：单独的“空列表项”（如无内容的 `-`）不再被当作上一项的续行污染问题文本，直接忽略。

### 工程

- 新增 `npm run typecheck`（`tsc --noEmit` 基于 JSDoc 的类型检查），CI 增加 Type check 步骤；新增 `typings/dsh.d.ts` / `typings/global.d.ts`，Host 与浏览器半的 JSDoc 从宽泛 `{object}` 收紧为真实接口类型。
- 新增 `test/client.test.js`（9 个用例：待确认清单解析、错误提示映射、增强历史），测试总数 29 → 38。

### 修复

- **诊断环并发竞争**：`markRequest` 改为按请求记录对象更新，避免并发增强请求互相覆盖状态与取消标记（`lib/index.js`）。
- **配置健壮性**：`resolveConfig` 对模式数值参数（`depth`/`treeLines`/`treeChars`/`fileChars`/`contentChars`/`maxTokens`）强制正整数，`temperature` 钳制到 [0, 2]，非法配置不再透传给网关。
- **请求体上限**：`readBody` 改为按字节统计，1MB 上限对纯中文请求体同样生效。
- **空正文处理**：模型仅输出待确认段时返回 `EMPTY_OUTPUT` 错误码，不再返回 `ok:true` 空正文导致客户端误判。
- **基础模式文案**：带回答重写时不再出现不存在的“项目上下文”字样。
- **发布工程**：`publish.yml` Verify 补 `typecheck`；新增 `prepublishOnly`；`@eslint/js` 显式声明为 devDependency；`@types/node` 与 engines 对齐（^22）；`./client` 导出补充类型声明（`lib/client.d.ts`）；安装/卸载脚本对符号链接安装副本跳过同步或仅删链接本身。

## [1.3.3] - 2026-08-25

### 修复

- **标准/专家模式再次“未能读取到项目上下文”**：`collectContext` 用 `fs.resolve('.')`
  （fs 服务全局根，默认是启动 `dsh` 的目录）校验会话 cwd 必须位于其下；多工作区场景
  下会话 cwd 在 fs 服务根之外时被误判为越权，抛 `Access denied` 后被路由吞掉，报
  “未能读取到项目上下文”。现改为直接以会话 cwd 为采集根（会话 header 的 cwd 在创建
  时已校验为绝对目录路径），并让诊断环记录 `collectContext` 的真实异常信息，方便后续
  排查。

## [1.3.2] - 2026-08-25

### 变更

- **最低 Node 版本提升至 ≥22**：Node 18/20 已 EOL，`engines` 与 CI 矩阵（22/24）对齐；发布工作流改用 Node 24。

### 工程

- GitHub Actions 升级至 `checkout@v5` / `setup-node@v5`（Node 24 运行时），消除 Node 20 运行时弃用警告。
- `package-lock.json` 根名称修正为 `@lidaxi/prompt-enhance`（随 1.3.0 scoped 改名遗留）。

### 文档

- README「开发与调试」同步命令目标路径改为 scoped 目录 `node_modules/@lidaxi/prompt-enhance`。

## [1.3.1] - 2026-08-25

### 修复

- **启动崩溃：`Cannot find package 'prompt-enhance'`**：`cordis.patch.yml` 插入行的 `name` 缺少 scope（`prompt-enhance` → `@lidaxi/prompt-enhance`），loader 按 `name` 解析包导致 `ERR_MODULE_NOT_FOUND`。
- **浏览器端加载失败：`loaded without registering "@lidaxi/prompt-enhance"`**：`lib/client.js` 的 `window.__ModuleLoader__.load({ id })` 注册 id 缺少 scope，与包名不一致导致 client-modules 校验失败。
- **install.ps1 第 4 步抛错**：给 PSCustomObject 直接赋值 `@` 开头属性名失败，改用 `Add-Member` 注册依赖，并统一依赖对象为 `[pscustomobject]`。

## [1.3.0] - 2026-08-25

### 发布

- 以 `@lidaxi/prompt-enhance` 发布到 npm registry（原名 `prompt-enhance` 因与既有包 `promptenhance` 名称过近被 registry 拒绝，改用作者 scope）。

### 新增
- **待确认问答闭环**：模型优先从项目上下文自答（可标注“（假设：…）”），只剩必须由用户决定的事项进入待确认清单；待确认项在对比面板逐条渲染为“问题 + 输入框”，点「按回答重新增强」把回答连同上一版增强正文发回 Host 做第二轮修订，返回修订后的正文与新清单，全程不离开面板。
- **回答记忆**：已填回答按问题文本记忆在 `localStorage`（`dsh:plugin:prompt-enhance:answers`），下次同类问题自动预填；面板提供「清除已记住的回答」。
- **跳过路径**：有待确认项时仍可「跳过确认，采用结果」或「放弃」，不强制回答。

### 变更
- **enhance 路由扩展**：`POST /api/prompt-enhance/enhance` 新增可选 `answers`（`[{question, answer}]`）与 `baseEnhanced`；携带回答时走修订轮次（`buildReviseSystem`/`buildReviseUser`），诊断日志标记 `revise`。
- **系统提示词规则 4**：能自答的别问（从项目上下文推断并标注假设），待确认项每条只问一个可直接作答的问题。

### 修复
- **标准/专家模式读不到项目上下文**：`collectContext` 直接对 `fs.resolve()` 返回的 `{ targetKey, displayPath }` 目标对象调用 `.replace()`，抛 `TypeError` 后被路由吞掉，提示“未能读取到项目上下文”。现按 `targetKey` 取路径并兼容字符串桩；测试桩同步改为真实目标对象形态。

## [1.2.0] - 2026-08-24

### 新增
- **通用模型适配**：自动降级推理档位（`effort`）、空输出自动关推理并加大预算重试、失败后按序回退候选模型链（≤3 个）。
- **待确认事项独立展示**：模型生成的“待确认”清单从正文剥离，仅显示在对比面板供用户参考，不污染正文。
- **浏览器错误自动上报**：`window.onerror` 和 `unhandledrejection` 自动上报到 Host 诊断端点。
- **诊断端点**：`GET /api/prompt-enhance/log` 和 `POST /api/prompt-enhance/log-error` 方便远程排查。
- **跨平台安装脚本**：新增 `install.sh` / `uninstall.sh` 支持 macOS/Linux。

### 变更
- **配置系统重构**：`config.modes.<id>` 支持覆盖所有模式参数（`effort`、`maxTokens`、`temperature`、上下文预算等）。
- **localStorage 键名规范化**：从 `prompt-enhance:mode` 改为 `dsh:plugin:prompt-enhance:mode`，避免命名冲突。

### 修复
- **流结束 reason 解析**：适配器返回的 `finish` chunk 按 `{ kind, failure? }` 对象处理，避免空输出重试逻辑失效。
- **路径安全**：`collectContext` 增加工作区根目录前缀校验，防止路径遍历攻击。
- **候选枚举稳定性**：`llm.listModels` 失败时自动 `.catch(() => [])`，防止单个 provider 异常破坏整体枚举。

---

## [1.1.0] - 前期版本（未公开发布）

- 初始实现：三种模式、对比面板、撤回功能、基础降级逻辑。
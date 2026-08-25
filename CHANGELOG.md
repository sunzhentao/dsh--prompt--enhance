# Changelog

所有显著更改都将记录在此文件中。

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
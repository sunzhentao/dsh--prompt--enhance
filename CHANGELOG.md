# Changelog

所有显著更改都将记录在此文件中。

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
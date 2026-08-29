# prompt-enhance（提示词增强 · DSH 通用插件）

[![Listed on dsh-plugin.org](https://dsh-plugin.org/badges/listed.svg)](https://dsh-plugin.org/plugins/sunzhentao/dsh-prompt-enhance)

💡 觉得好用？去 [dsh-plugin.org](https://dsh-plugin.org/plugins/sunzhentao/dsh-prompt-enhance) 查看插件详情并点个 ⭐，支持一下作者～

DSH Web profile 的静态插件：随 harness 启动自动加载，**无需每次手动重新加载**。任何机器、任何经 DSH 注册的模型/网关均可直接使用；模型能力差异由插件在运行时自动适配，无需修改代码。

![License](https://img.shields.io/badge/license-Apache--2.0-blue)
![CI](https://github.com/sunzhentao/dsh--prompt--enhance/actions/workflows/ci.yml/badge.svg)

## 文档

- [贡献指南](CONTRIBUTING.md) — 报告问题 / 提交代码 / 开发与测试
- [更新日志](CHANGELOG.md)
- [安全说明](SECURITY.md)
- [许可证](LICENSE) — Apache-2.0

## 结构

| 文件 | 内容 |
| --- | --- |
| `lib/index.js` | Host 半（ESM 静态 Cordis 插件）：注册 `POST /api/prompt-enhance/enhance`，按模式读取会话 cwd → 采集项目上下文（目录结构 + 依赖/配置/入口文件）→ 调会话默认 LLM 重写提示词（失败自动降级重试 + 回退候选模型链，最多 3 个候选）。 |
| `lib/client.js` | 浏览器半（`window.__ModuleLoader__.load` 手写 bundle）：在 `conversation.input.right` 注册模式选择 + ✦ 按钮、`conversation.input.overlay` 注册对比面板与浮动提示条；`fetch` 调 Host 路由（同源）。 |
| `cordis.patch.yml` | bundle 补丁：向 profile 组合树插入插件行 `prompt-enhance`（部署可经 `$DSH_HOME/cordis.patch.yml` 或 `--patch` 覆盖其 config）。 |
| `package.json` | `main` = Host 半、`exports["./client"]` = 浏览器半、`dsh.bundle.patch`、`dsh.client` 声明。 |

## 功能（v1.4.0）

- **通用模型适配（本次核心）**：插件**不针对任何厂商硬编码**，所有能力差异都在运行时自动探测与降级：
  - 按模式发送 `reasoningEffort`（基础/标准默认 `off` 关推理、专家默认 `high` 深思）；模型/网关**不支持或拒绝该参数**（返回错误、400、`developer` 角色不被接受等）时，自动在**同一候选上去掉档位重试一次**，不影响可用性。
  - 隐藏推理吃光输出预算导致**空输出**时，自动同一候选**关推理并加大预算**重试；若连档位参数本身都被网关拒绝，再补一次彻底无档位的调用。
  - 默认模型失败自动按序回退候选模型（≤3 个），全失败才报错，并逐次记录失败原因。
  - 对“推理档位完全不可用”的网关，可在配置里把对应模式设为 `effort: none`，直接跳过档位发送。
- **三种增强模式**（✦ 按钮左侧的模式按钮切换，选择记忆在 localStorage）：
  - **基础**：纯文本润色，不读取项目上下文，快、省 token（去口头禅/修正错别字/补齐要素）。
  - **标准**：结合项目上下文（目录结构 + 依赖配置 + 入口文件）重写，引用具体文件路径。
  - **专家**：更深层上下文（4 层目录、更大字符预算）+ 任务分析 + 可验证验收标准。
- **对比确认**：增强完成后弹出「原文 | 增强后」对比面板，**点「采用增强结果」才回填输入框**，或「放弃」保留原文。
- **可撤回**：采用后 9 秒内可点「↩ 撤回」恢复原文。
- **会话内增强历史**：每次成功增强/修订的结果自动记入历史（内存，上限 20 条，刷新页面即清空）；对比面板可展开「历史版本」查看并一键采用任一版本（沿用原文变更保护，采用后仍可撤回原文）。
- **忙碌状态卡**：等待期间显示「正在增强（模式）… 已用时 N 秒」，带 **取消** 按钮（真正中断服务端流式调用）。
- **空输入禁用**：输入框为空时 ✦ 按钮禁用。
- **待确认段独立展示**：模型信息不足时生成的“待确认”清单会被插件从正文中剥离，单独显示在对比面板；**采用/发送给大模型的永远是干净正文**。
- **待确认问答闭环**：模型优先从项目上下文自答（可标注“（假设：…）”），只剩必须由用户决定的事项进入清单；清单在对比面板逐条渲染为「问题 + 输入框」，点「按回答重新增强」把回答连同上一版增强正文发回 Host 做第二轮修订（模型把确认信息修订进正文，仍缺失再问），填过的回答按问题记忆在 localStorage，下次同类问题自动预填；也可以「跳过确认，采用结果」或「放弃」。
- **稳定性**：overlay 不调用 `useInput` 钩子（改用右槽草稿镜像做变化检测）；`publish` 定时器失败不阻塞状态推进；忙碌超时 120 秒自动取消；浏览器 JS 错误自动上报 Host 诊断环（`GET /api/prompt-enhance/log` 可查最近请求与错误）。
- **改写规则**：语言与语气跟随草稿（代码/路径/术语逐字保留）；信息不足时列出最少关键待确认项（自动剥离展示，不写入正文），不编造。
- **可配置**：模式参数、模型候选链等均可通过组合行 config 覆盖（见下节），部署适配零改码。
- **键盘快捷键**：对比面板按 `Esc` 放弃、`Enter` 采用（焦点在回答输入框时 `Enter` 仍为"按回答重新增强"）；任意位置按 `Ctrl+Shift+E`（macOS `Cmd+Shift+E`）触发增强。
- **友好错误提示**：Host 返回稳定错误码（`NO_CONTEXT`、`ALL_MODELS_FAILED` 等），客户端映射为用户可操作提示。

## 使用场景与最佳实践

### 典型场景

1. **快速润色需求描述（基础模式）**：把一段口语化的需求描述（"帮我做个登录界面，要好看的"）在数秒内整理成含目标、约束、输出格式的完整提示词，不读取项目上下文，适合随手起草。
2. **为已有项目生成组件规格（专家模式）**：在 React 项目里写"给商品列表加筛选功能"，专家模式会读取目录结构与关键代码，引用现有组件/接口路径，输出带验收标准的规格。
3. **结合现有 API 编写调用代码的需求（标准模式）**：在含 API 定义的项目中写"实现用户注册"，标准模式会提取出入口文件与依赖，让提示词贴合项目真实技术栈。

### 模式选择建议

| 场景 | 推荐模式 | 说明 |
| --- | --- | --- |
| 随手润色、不依赖项目 | 基础 | 快、省 token，纯文本层面清理 |
| 需要引用项目结构/依赖/入口 | 标准 | 读取目录树 + 关键配置与代码（3 层预算） |
| 深层任务分析 + 验收标准 | 专家 | 更大上下文预算 + 任务分析 + 可验证验收标准 |
| 网关不支持推理档位 | 任意（配 `effort: none`） | 在 `cordis.patch.yml` 中为该模式关闭档位发送 |

### 故障排查

| 现象 | 错误码 | 处理建议 |
| --- | --- | --- |
| "未能读取到项目上下文" | `NO_CONTEXT` | 确认会话已关联工作目录且目录可读；临时可切换为基础模式 |
| "当前会话未关联工作目录" | `NO_CWD` | 先打开一个项目工作区，或切换为基础模式 |
| "候选模型均调用失败" | `ALL_MODELS_FAILED` | 检查网络/网关/模型配置，或切换为基础模式 |
| "未找到可用模型" | `NO_CANDIDATES` | 在 DSH 设置中配置模型后重试 |
| 增强超过 120 秒无结果 | （客户端超时自动取消） | 检查网关延迟；可配置该模式 `effort: none` 或调大 `maxTokens` |
| 浏览器控制台报错 | （自动上报诊断环） | `GET /api/prompt-enhance/log` 查看最近请求与错误详情 |

## 配置

插件读取组合行 `prompt-enhance` 的 `config`（Cordis `apply(ctx, config)`）。默认行为无需任何配置；需要适配特定模型/网关时，在 `$DSH_HOME/cordis.patch.yml`（对所有 profile 生效，机器级）或 `--patch` 覆盖层里写（同一 row id 的 `config` 会**整体替换**本行 config，所以请写全）：

```yaml
# $DSH_HOME/cordis.patch.yml
- id: prompt-enhance
  config:
    maxAttempts: 3            # 候选模型链长度上限（1-6，默认 3）
    autoFill: true            # 是否自动从已注册 provider 补足候选（默认 true）
    candidates:               # 固定候选链（可选，优先于会话默认模型）
      - { provider: my-provider, model: my-model }
    system: ""                # 可选：完整替换内置系统提示词；留空字符串表示使用默认内置提示词
    modes:
      basic:
        effort: off           # 'off'|'low'|'high'|'max'（按模型支持发送）
                              # 或 'none'：完全不发送推理档位参数
        maxTokens: 2000
        temperature: 0.4
      standard:
        effort: off
        maxTokens: 3000
        temperature: 0.3
        depth: 3              # 上下文采集：目录递归层数
        treeLines: 160        # 目录树行数上限
        treeChars: 7000       # 目录树字符上限
        fileChars: 6000       # 单个配置文件内容上限
        contentChars: 11000   # 文件内容合计上限
        extra: ""             # 追加到系统提示词的模式说明
      expert:
        effort: high
        maxTokens: 5000
        temperature: 0.2
        depth: 4
        treeLines: 260
        treeChars: 12000
        fileChars: 9000
        contentChars: 18000
```

## 安装（其他机器）

前提：已安装 DeepSeek Harness 并启用 web profile（`dsh web`）。

**方式一（推荐）：npm 一键安装**

插件已发布到 npm registry，使用 DSH 官方插件命令安装：

```bash
# 安装
dsh plugin --profile web add @lidaxi/prompt-enhance

# 升级
dsh plugin --profile web update @lidaxi/prompt-enhance

# 卸载
dsh plugin --profile web remove @lidaxi/prompt-enhance
```

安装后重启 `dsh web` 并刷新页面即可。`dsh plugin` 会自动把本包加入 `dsh.profile.bundles`（包内 `dsh.bundle.patch` 组合补丁与 `dsh.client.inject` 浏览器半声明随 bundle 自动生效），无需手工编辑任何文件。

**方式二：从源码安装（本地开发 / 贡献者）**

仓库自带 `install.ps1` / `install.sh`，clone 后在仓库目录直接执行：

```powershell
.\install.ps1
```

```bash
chmod +x install.sh
./install.sh
```

脚本会自动：创建源码联接 → 同步安装副本（含语法与一致性校验）→ 注册依赖与 bundle（`file:` 依赖）。改完代码只需重新执行脚本 + 重启 dsh web。卸载用 `.\uninstall.ps1` / `./uninstall.sh`（安全：只删联接/副本/注册，保留本仓库源码）。

**方式三：手动**

```powershell
# 1) 把插件源码放到 DSH 插件目录（<repo> = 本仓库 clone 路径）
Copy-Item -Recurse <repo> "$HOME\.dsh\plugins\prompt-enhance"

# 2) 注册依赖与 bundle（编辑 $HOME\.dsh\profiles\web\package.json）：
#    dependencies 增加：
#      "@lidaxi/prompt-enhance": "file:../../plugins/prompt-enhance"
#    dsh.profile.bundles 数组增加：
#      "@lidaxi/prompt-enhance"
#    （插件的 cordis.patch.yml 组合补丁与 dsh.client.inject 声明会随 bundle 自动生效）

# 3) 重启 dsh web，刷新页面
```

重启后：composer 发送按钮左侧出现 [模式 ▾] [✦]（✦ 为增强按钮）。

## 开发与调试

- 本地源码开发：改完源码后重跑 `install.sh` / `install.ps1` 同步到安装副本，再重启 harness 生效：

```powershell
Copy-Item "$HOME\.dsh\plugins\prompt-enhance\lib\index.js", "$HOME\.dsh\plugins\prompt-enhance\lib\client.js" "$HOME\.dsh\profiles\web\node_modules\@lidaxi\prompt-enhance\lib\" -Force
```

```bash
# macOS / Linux
cp lib/index.js lib/client.js "$HOME/.dsh/profiles/web/node_modules/@lidaxi/prompt-enhance/lib/"
```

- 诊断：`GET /api/prompt-enhance/log` 返回最近请求记录（状态 / 耗时 / 所用模型 / 浏览器错误上报）。

## 工作原理

- **Host 半**（`lib/index.js`）注册 `POST /api/prompt-enhance/enhance`：按模式读取会话工作目录 → 采集项目上下文（目录树 + 依赖/配置/入口文件）→ 用会话默认 LLM 流式重写提示词（失败自动降级重试：去档位 / 关推理加大预算，再回退候选模型链 ≤3 个，支持取消中断）。
- **浏览器半**（`lib/client.js`）在 `conversation.input.right` 注册模式选择 + ✦ 按钮，在 `conversation.input.overlay` 注册对比面板 / 忙碌状态卡 / 提示条；采用增强结果前先对比原文与增强后，采用后 9 秒内可撤回。
- **模型能力适配**：插件始终先按模式档位调用；任一失败（网关拒绝档位参数、适配器不支持、空输出、限流等）都会在同一候选上自动降级——先去掉档位参数重试，空输出（输出预算耗尽）则关推理并加大预算重试，仍失败再按序回退下一个候选。整个流程不依赖任何厂商特有的错误码或模型名单。
- **待确认清单**：模型信息不足时生成的"待确认"段会被插件从正文剥离，不随正文发送给下游模型；用户可在对比面板逐条回答，插件带答案做第二轮“修订增强正文”调用（`answers` + `baseEnhanced`），返回修订后的正文与新清单。

## 通用兼容性说明

- **官方 DeepSeek API**：完整支持（`off / low / high / max` 推理档位，基础/标准默认 `off` 实测 6-10s 出全量正文）。
- **任意 OpenAI 兼容网关 / 私有代理 / 内部模型**：开箱即用。推理档位参数被网关拒绝（含 400、`developer` 角色不被接受、`thinking` 等参数不识别）时自动去掉档位重试；参数彻底不可用时把对应模式配置为 `effort: none` 即可跳过。插件不针对任何特定厂商做硬编码，新增模型无需改动。
- **推理模型**：隐藏推理吃光输出预算导致空输出时自动关推理并加大预算重试；预算仍不足可在配置中调大该模式 `maxTokens`。

## 已知约束

- 增强模型默认 = 会话默认模型（`agentDefaultModel.currentSelection()`），失败回退候选模型链（默认 ≤3 个；可用 `config.candidates` 固定候选链、`config.maxAttempts` 调整长度）。
- 上下文采集上限（标准模式默认）：目录 3 层、树 160 行 / 7000 字符、文件内容合计 11000 字符、单文件 6000 字符；专家模式预算更大（4 层 / 260 行 / 12000 字符树 / 18000 字符内容）。均可按模式配置覆盖。
- 基础模式不依赖会话工作目录；标准/专家模式需要会话关联工作目录。
- 增强期间用户修改输入框则不覆盖，提示重试。

## 许可证

本仓库采用 [Apache-2.0](LICENSE) 许可证，贡献即代表您同意该许可证。

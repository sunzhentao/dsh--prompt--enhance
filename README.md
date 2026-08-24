# prompt-enhance（提示词增强 · 静态 profile 插件）

DSH Web profile 的本地静态插件：随 harness 启动自动加载，**无需每次手动重新加载**（取代了原会话级动态插件 的手动恢复流程）。

## 结构

| 文件 | 内容 |
| --- | --- |
| `lib/index.js` | Host 半（ESM 静态 Cordis 插件）：注册 `POST /api/prompt-enhance/enhance`，按模式读取会话 cwd → 采集项目上下文（目录结构 + 依赖/配置/入口文件）→ 调会话默认 LLM 重写提示词（失败自动回退候选模型链，最多 3 次）。 |
| `lib/client.js` | 浏览器半（`window.__ModuleLoader__.load` 手写 bundle）：在 `conversation.input.right` 注册模式选择 + ✦ 按钮、`conversation.input.overlay` 注册对比面板与浮动提示条；`fetch` 调 Host 路由（同源）。 |
| `cordis.patch.yml` | bundle 补丁：向 profile 组合树插入插件行 `prompt-enhance`。 |
| `package.json` | `main` = Host 半、`exports["./client"]` = 浏览器半、`dsh.bundle.patch`、`dsh.client` 声明。 |

## 功能（v1.1.4）

- **推理档位修复（本次）**：基础/标准改为 `reasoningEffort: off`（适配器映射为 `thinking.type=disabled`，真正关闭隐藏推理）。此前用 low 档实测该模型仍推理 1500+ tokens——慢（15-25s/次）且会吃光 `maxTokens` 预算导致**输出为空**，插件空输出后逐个换候选，总计 60-90 秒才失败（即"一分钟完不成"）。关推理后官方 API 实测 6-10s 出全量正文。专家模式保留 `high`（预算提到 5000）；若某模型仍出现"空输出（推理耗尽预算）"，会同一候选关推理＋加大预算重试一次。
- **待确认段独立展示（v1.1.3）**：模型信息不足时生成的"待确认"清单会被插件从正文中剥离，单独显示在对比面板的「待确认事项（仅参考，不会写入正文）」区；**采用/发送给大模型的永远是干净正文**。
- **稳定性加固（v1.1.2）**：overlay 不再调用 `useInput` 钩子（改用右槽草稿镜像做变化检测），避免钩子不可用时整个输入区崩溃（"转圈后不可用"）；`publish` 定时器失败不再阻塞状态推进；忙碌超时 120 秒自动取消；浏览器 JS 错误自动上报 Host 诊断环（`GET /api/prompt-enhance/log` 可查最近请求与错误）。

- **三种增强模式**（✦ 按钮左侧的模式按钮切换，选择记忆在 localStorage）：
  - **基础**：纯文本润色，不读取项目上下文，快、省 token（去口头禅/修正错别字/补齐要素）。
  - **标准**：结合项目上下文（目录结构 + 依赖配置 + 入口文件）重写，引用具体文件路径。
  - **专家**：更深层上下文（4 层目录、更大字符预算）+ 任务分析 + 可验证验收标准。
- **对比确认**：增强完成后弹出「原文 | 增强后」对比面板，**点「采用增强结果」才回填输入框**，或「放弃」保留原文。
- **可撤回**：采用后 9 秒内可点「↩ 撤回」恢复原文。
- **忙碌状态卡**：等待期间显示「正在增强（模式）… 已用时 N 秒」，带 **取消** 按钮（真正中断服务端流式调用）。
- **空输入禁用**：输入框为空时 ✦ 按钮禁用（不再点击后才报错）。
- **自动推理档位**：按模式发送 `reasoningEffort`（基础/标准=off 关推理、专家=high 深思），仅当模型支持时；模型/适配器不支持（如部分私有代理）会自动去掉该参数重试，不影响可用性。
- **失败模型链**：默认模型失败自动按序尝试候选模型，最多 3 次，全失败才报错。
- **改写规则强化**：语言与语气跟随草稿（代码/路径/术语逐字保留）；信息不足时列出最少关键待确认项（自动剥离展示，不写入正文），不编造。
- 增强期间用户修改输入框则不覆盖，提示重试。

> 注意：部分私有代理不支持推理等级（声明 `reasoningEfforts` 后适配器会发 `developer` 角色导致 400）；此类代理走无 effort 的慢速路径。

## 安装（其他机器）

前提：已安装 DeepSeek Harness 并启用 web profile（`dsh web`）。

**方式一（推荐）：一键脚本**

仓库自带 `install.ps1`，clone 后在仓库目录直接执行：

```powershell
.\install.ps1
```

脚本会自动：创建源码联接 → 同步安装副本（含语法与一致性校验）→ 注册依赖与 bundle。之后**改完代码只需重新执行脚本 + 重启 dsh web**。卸载用 `.\uninstall.ps1`（安全：只删联接/副本/注册，保留本仓库源码）。

**方式二：手动**

```powershell
# 1) 把插件源码放到 DSH 插件目录（<repo> = 本仓库 clone 路径）
Copy-Item -Recurse <repo> "$HOME\.dsh\plugins\prompt-enhance"

# 2) 注册依赖与 bundle（编辑 $HOME\.dsh\profiles\web\package.json）：
#    dependencies 增加：
#      "prompt-enhance": "file:../../plugins/prompt-enhance"
#    dsh.profile.bundles 数组增加：
#      "prompt-enhance"
#    （插件的 cordis.patch.yml 组合补丁与 dsh.client.inject 声明会随 bundle 自动生效）

# 3) 重启 dsh web，刷新页面
```

重启后：composer 发送按钮左侧出现 [模式 ▾] [✦]（✦ 为增强按钮）。

## 开发与调试

- 改完源码需同步到安装副本并重启 harness 才生效：

```powershell
Copy-Item "$HOME\.dsh\plugins\prompt-enhance\lib\index.js", "$HOME\.dsh\plugins\prompt-enhance\lib\client.js" "$HOME\.dsh\profiles\web\node_modules\prompt-enhance\lib\" -Force
```

- 诊断：`GET /api/prompt-enhance/log` 返回最近请求记录（状态 / 耗时 / 所用模型 / 浏览器错误上报）。

## 工作原理

- **Host 半**（`lib/index.js`）注册 `POST /api/prompt-enhance/enhance`：按模式读取会话工作目录 → 采集项目上下文（目录树 + 依赖/配置/入口文件）→ 用会话默认 LLM 流式重写提示词（失败回退候选模型链 ≤3 次，支持取消中断）。
- **浏览器半**（`lib/client.js`）在 `conversation.input.right` 注册模式选择 + ✦ 按钮，在 `conversation.input.overlay` 注册对比面板 / 忙碌状态卡 / 提示条；采用增强结果前先对比原文与增强后，采用后 9 秒内可撤回。
- **推理档位**：基础/标准 `off`（关闭隐藏推理，官方 DeepSeek 实测 6-10s 出全量正文），专家 `high`（深思熟虑）；模型/代理不支持推理档位时自动去掉该参数重试。
- **待确认清单**：模型信息不足时生成的"待确认"段会被插件从正文剥离，仅显示在对比面板供用户参考，不随正文发送给下游模型。

## 已知约束

- 增强模型 = 会话默认模型（`agentDefaultModel.currentSelection()`），失败回退候选模型链（≤3 次）。
- 上下文采集上限（标准模式）：目录 3 层、树 160 行 / 7000 字符、文件内容合计 11000 字符、单文件 6000 字符；专家模式预算更大（4 层 / 260 行 / 12000 字符树 / 18000 字符内容）。
- 基础模式不依赖会话工作目录；标准/专家模式需要会话关联工作目录。
- 增强期间用户修改输入框则不覆盖，提示重试。

## 兼容性说明

- **官方 DeepSeek API**：完全支持（`off / low / high / max` 推理档位）。
- **部分私有代理**：不支持推理档位（若为其模型声明 `reasoningEfforts`，适配器会发送 `developer` 角色导致 400），插件自动走无推理的慢速路径，功能可用。
- **其他 OpenAI 兼容代理**：按其声明的 `reasoningEfforts` 发送档位；不支持时插件自动去掉该参数重试。

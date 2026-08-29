# 贡献指南

感谢您关注 `prompt-enhance` 插件！我们欢迎任何形式的贡献：报告问题、提出建议、提交代码。

## 行为准则

请遵守 [Contributor Covenant](https://www.contributor-covenant.org/version/2/1/code_of_conduct/) 行为准则。

## 如何贡献

### 1. 报告问题

在 GitHub Issues 中报告问题，请附上：
- DSH 版本（`dsh --version`）
- Node.js 版本（`node --version`）
- 操作系统
- 复现步骤
- 相关日志（可在浏览器开发者工具 Console 中查看）

### 2. 提出建议

使用 Issues 或 Discussions 提出新功能想法，请说明：
- 解决了什么痛点
- 大致的使用场景
- 如果愿意，可以附上设计思路

### 3. 提交代码

1. **Fork 本仓库**，创建您的特性分支：
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. 完成修改后，确保代码通过语法检查并在本地 DSH 环境中验证功能（见下文「开发与测试」）。

3. 提交信息遵循 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/) 规范：

   ```text
   feat: 添加 XX 功能
   fix: 修复 XX 问题
   docs: 更新文档
   chore: 构建/工具变动
   ```

4. 发起 Pull Request 到 `main` 分支。

## 开发与测试

### 开发环境

- Node.js >= 22
- 已安装 DSH 并启用 `web` profile（通过 npm 分发的用户安装用 `dsh plugin --profile web add @lidaxi/prompt-enhance`；仓库内脚本 `install.sh` / `install.ps1` 用于本地源码开发）

克隆仓库后：

```bash
# macOS / Linux
chmod +x install.sh
./install.sh

# Windows
.\install.ps1
```

修改源码后，重新运行安装脚本并重启 dsh web 即可测试。

### 本地验证

确保代码通过语法检查、代码风格与单元测试：

```bash
npm run check      # 语法检查（node --check）
npm run typecheck  # 类型检查（tsc --noEmit，基于 JSDoc）
npm run lint       # ESLint 代码风格检查
npm test           # 单元测试（node --test）
```

在本地 DSH 环境中验证功能（运行 `./install.sh` 或 `install.ps1`）。

### 代码风格

- 使用 ESLint（`eslint.config.js` 已配置，`npm run lint` 检查）
- 所有公开函数、API 路由需有 JSDoc 注释（Host 半的 API 路由见 `lib/index.js` 的 `apply`）
- 保持与现有代码风格一致（2 空格缩进，单引号，无分号）

### 测试

单元测试放在 `test/` 目录，使用 Node.js 内置测试运行器（`node --test`，即 `npm test`）。当前覆盖：

- 单元测试（`test/index.test.js`）：配置解析、模型降级重试链、上下文采集、待确认段剥离、系统提示词组装等 Host 导出函数。
- 客户端单元测试（`test/client.test.js`）：待确认清单解析、错误码 → 友好提示映射、增强历史（9 个用例）。
- 集成测试（`test/enhance.integration.test.js`）：以 fake `ctx` 驱动 `apply` 注册的完整增强路由，覆盖成功链路与关键错误码（`EMPTY_DRAFT` / `NO_CANDIDATES` / `ALL_MODELS_FAILED`）。

欢迎继续贡献更多用例（如取消请求、修订轮次）。

## 可贡献方向

- **功能**：新增增强模式、模板管理、多轮对话上下文感知（需先确认 DSH `sessions` 服务是否暴露历史消息）。
- **工程**：补充集成测试（取消请求、修订轮次）、错误码-提示映射、优化对比面板布局（上下/左右切换）。
- **文档**：使用场景示例、模式选择决策树、故障排查表、英文版 README。

## DSH 接口约定（贡献前必读）

- Host 半是 Cordis 静态插件：`apply(ctx, config)` 中通过 `ctx.get('sessions')` / `ctx.get('fs')` / `ctx.get('llm')` / `ctx.get('agentDefaultModel')` 取服务，路由经 `ctx.webServer.register({ kind: 'exact', path, handler })` 注册。
- 浏览器半遵循 `window.__ModuleLoader__.load({ id, factory })` 手写 bundle 格式，经 `package.json` 的 `dsh.client.inject` 注入到 `conversation.input.right` / `conversation.input.overlay` 槽位。
- 组合行配置经 `cordis.patch.yml` 插入：同一 row id 的 `config` 会整体替换，部署覆盖时需写全顶层键。

## 许可证

本仓库采用 Apache-2.0 许可证，贡献即代表您同意该许可证。

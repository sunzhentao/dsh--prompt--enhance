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

- Node.js >= 18
- 已安装 DSH 并启用 `web` profile（通过 npm 分发的用户安装用 `dsh plugin --profile web add prompt-enhance`；仓库内脚本 `install.sh` / `install.ps1` 用于本地源码开发）

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
npm run check   # 语法检查（node --check）
npm run lint    # ESLint 代码风格检查
npm test        # 单元测试（node --test）
```

在本地 DSH 环境中验证功能（运行 `./install.sh` 或 `install.ps1`）。

### 代码风格

- 使用 ESLint（`eslint.config.js` 已配置，`npm run lint` 检查）
- 所有公开函数、API 路由需有 JSDoc 注释（Host 半的 API 路由见 `lib/index.js` 的 `apply`）
- 保持与现有代码风格一致（2 空格缩进，单引号，无分号）

### 测试

单元测试放在 `test/` 目录，使用 Node.js 内置测试运行器（`node --test`，即 `npm test`）。目前已覆盖配置解析、降级重试链、上下文采集路径防护与待确认段剥离，欢迎继续贡献更多用例。

## 许可证

本仓库采用 Apache-2.0 许可证，贡献即代表您同意该许可证。

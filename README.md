# Whisper

Whisper 是一款本地优先的 AI 读书辅助工具。原书保持在阅读中心，用户导入 Markdown，在阅读器中选择书籍、章节或原文作为解读目标，再通过 AI 解释、持续追问。

## 功能

- 导入并阅读 Markdown 书籍。
- 按全书、章节或选中原文发起 AI 解读。
- 围绕书籍持续追问，并保存、恢复阅读会话。
- 支持 OpenAI-compatible API。

## 开发

```bash
pnpm install
pnpm dev
```

首次使用时在设置中填写 OpenAI-compatible 的 `baseURL`、`apiKey`、`model` 与上下文窗口。书籍、设置和会话数据保存在本机 Electron `userData` 目录，不会同步到云端。

## 验证

提交修改前运行唯一的完整本地质量门：

```bash
pnpm check
```

开发时也可以按需运行：

```bash
pnpm test
pnpm test:watch
pnpm lint:types
pnpm build
```

涉及导入、阅读、流式对话、恢复或设置的修改，还应执行 [人工验收清单](docs/MANUAL_TESTING.md)。

## 项目导航

- [架构说明](ARCHITECTURE.md)
- [产品与设计规格](docs/specs/)
- [人工验收清单](docs/MANUAL_TESTING.md)
- [项目协作说明](AGENTS.md)

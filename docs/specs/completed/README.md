# 已完成规格

这些规格已完成实施并作为需求与决策历史保留：

- `2026-07-09-ai-reading-copilot-design.md`：产品与 MVP 基线。
- `2026-07-10-chat-history-persistence-design.md`：按书恢复会话历史与活跃 Tab。
- `2026-07-10-main-process-logging-design.md`：主进程日志与敏感信息脱敏。
- `2026-07-12-ai-chat-redesign.md`：当前 AI 会话的目标、技能、引用和生命周期模型。
- `2026-07-13-streaming-conversation-visibility-design.md`：首次请求的流式即时可见行为。

这里的“已完成”表示对应实施已落地，不保证文档里的依赖版本和历史实现步骤仍是当前操作说明。当前系统形态以代码、测试和 `ARCHITECTURE.md` 为准。

目前没有整份规格被另一份规格完全替代，因此没有把历史规格移入 `superseded/`。局部演进由后续规格覆盖：发生冲突时，日期更晚且范围更具体的规格优先。

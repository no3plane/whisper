# Renderer 架构收敛规格

状态：已完成

## 目标

在不改变现有界面和用户行为的前提下，降低阅读页的状态耦合，隔离跨书 AI 流事件，统一关键异步错误处理，并让 renderer 只依赖 shared 中声明的 preload API 契约。

## 验收条件

- 当前书籍只处理属于该书的 AI 流事件。
- 会话、打开的 Tab、活动视图、草稿和待发送引用由一个可独立测试的状态模型维护。
- `ReaderPage` 不再直接编排会话 IPC，也不直接实现原文高亮生命周期。
- `RightAiPanel` 不再接收重复的历史线程和可由状态推导的数据。
- 书库、设置和会话命令失败时进入可见错误状态，不产生未处理的 Promise rejection。
- `WhisperApi` 契约位于 `src/shared/`；Harness 阻止 renderer 导入 preload、main、Electron 或 Node API。
- 既有交互保持不变，`pnpm check` 通过。

## 非目标

- 不引入 Redux、Zustand、React Query 或路由框架。
- 不进行视觉改版。
- 不改变 IPC channel、数据库模型或主进程业务规则。

## 设计

- `conversationWorkspace.ts` 保存纯状态、动作与 reducer。
- `useConversationWorkspace.ts` 负责加载历史、订阅流事件和执行会话命令。
- `useSourceLocator.ts` 负责 Range 恢复、滚动、临时高亮与清理。
- 页面只加载书籍、捕获用户选区并组合上述 feature。
- preload 和 renderer 共同依赖 `shared/whisperApi.ts` 中的接口，不互相依赖实现文件。

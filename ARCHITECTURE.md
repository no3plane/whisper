# Whisper 架构

## 总览

Whisper 是单窗口、本地优先的 Electron 应用。Renderer 负责展示和临时交互状态；Main Process 负责文件、SQLite、AI 调用和持久化；Preload 是两者之间唯一受控桥梁。

```text
React Renderer
    │ window.whisper
    ▼
Preload（最小 API）
    │ Electron IPC
    ▼
Main Process
    ├── LibraryService / shared Markdown analysis
    ├── ReadingActionService / AIProvider / ContextAssembler
    ├── ThreadStore / SettingsService
    └── SQLite / logger / filesystem
```

## 进程边界

### Main Process

`src/main/index.ts` 组装应用和窗口，`src/main/ipc/registerIpc.ts` 注册跨进程入口。主进程拥有所有高权限能力：

- `library/` 导入、解析和读取书籍。
- `ai/` 组装书籍上下文、调用模型、管理流式生命周期。
- `threads/` 保存会话与消息。
- `storage/` 管理 SQLite 连接和 schema。
- `settings/` 保存模型设置。
- `logging/` 记录主进程关键事件并脱敏。

所有来自 IPC、文件和外部服务的数据都视为不可信输入，在进入领域服务前完成运行时校验。

### Preload

`src/preload/index.ts` 把白名单能力暴露为 `window.whisper`。它不包含业务规则，不暴露 `ipcRenderer` 本身，也不允许 renderer 自由选择 channel。

### Renderer

`src/renderer/` 负责书库、阅读器、AI 面板、选区快照和草稿状态。它只能通过 preload API 请求高权限操作，不导入 `src/main/`，也不直接访问 Node、SQLite 或文件系统。

Renderer 采用“页面组装、功能内聚”的模块结构：

- `pages/` 保存页面入口和页面级状态编排；页面可以组合多个 feature，但页面之间不相互依赖。
- `features/` 按用户能力收拢 UI、样式、状态和纯逻辑；feature 可以依赖 `api/` 和 `src/shared/`，但不依赖页面。
- `api/` 是 renderer 到 preload API 的最小适配层。
- 只有被多个无关 feature 实际复用的代码才提升到 renderer 的共享目录，不提前创建通用抽象。

Renderer 目录使用 `kebab-case`，React 组件和对应 CSS Module 使用 `PascalCase`，普通 TypeScript 模块使用 `camelCase`，Hook 使用 `useXxx`。这些可机械判断的边界由 Harness 阻断；代码是否属于正确 feature 继续由评审判断。

### Shared

`src/shared/` 保存跨进程数据契约、IPC channel 和不依赖运行环境的纯定义。它不能依赖 Electron、React 或 main/renderer 的实现。

## 关键数据流

### 导入与阅读

1. Renderer 请求选择并导入文件。
2. Main Process 只接受 `.md`，把 Markdown 副本保存到本地书库。
3. 原始 Markdown 是正文唯一事实来源；共享 mdast 分析按需派生章节和 block。
4. Renderer 语义化渲染 Markdown，目录、选区锚点和阅读位置复用同一 block ID。
5. AI 上下文从 Markdown block 派生，不持久化第二份 passage 正文。

### AI 会话

1. Renderer 提交固定解读目标、可选技能和问题。
2. ReadingActionService 创建 thread 与消息。
3. ContextAssembler 组合全书认知、目标内容和引用，避免重复上下文。
4. AIProvider 发起模型请求；主进程通过 IPC 发送 `started`、`chunk`、`done` 或 `error`。
5. Renderer 增量归并流事件，ThreadStore 保存最终状态，重启后可恢复。

## 数据与兼容

- SQLite 数据只在主进程中读写。
- schema 定义与连接管理分别集中在 `src/main/storage/schema.ts` 和 `database.ts`。
- schema 使用显式版本门禁；当前开发期破坏性版本不迁移旧库，也不自动删除数据库。
- API key 属于敏感信息；日志只能记录脱敏后的设置。

## 验证策略

- TypeScript 检查跨模块静态契约。
- Vitest 覆盖共享纯逻辑、主进程服务和 renderer 关键状态/交互。
- `pnpm check` 是完成前的统一质量入口。
- 自动测试未覆盖的真实桌面行为使用 `docs/MANUAL_TESTING.md`，不把人工验证表述为自动保证。

长期架构取舍写入 `docs/decisions/`；本文件只描述当前有效的系统形态与不变量。

# 阅读会话历史持久化与恢复

日期：2026-07-10

## 问题

聊天与追问内容已写入 SQLite（`reading_threads` / `thread_messages`），但打开书籍时前端只从内存流式事件构建右侧面板。退出或离开阅读页后，历史会话看起来「丢了」。

## 目标

- 重新打开同一本书时，右侧能看到该书全部历史会话与完整消息。
- 默认自动打开**上次点开的 tab**（含「问题地图」）。
- 「上次选中的 thread」与书绑定，持久化到本地数据库。

## 非目标

- 不做跨设备同步。
- 不改流式回答、追问、问题地图生成逻辑。
- 不做会话删除 / 重命名 UI（后续可加）。
- 不引入懒加载消息（当前会话量小，一次拉齐更简单）。

## 方案选择

采用「按书加载 threads + messages，并把 active thread 写进 `books` 表」：

1. 复用现有 `ThreadStore` 与表结构。
2. 选中态跟书绑定，长期可维护。
3. 避免把书库 UI 状态塞进 settings JSON。

## 数据模型

### `books` 表新增列

```sql
active_thread_id TEXT NULL
```

语义：

- 非空：该书右侧面板上次选中的 `reading_threads.id`
- `NULL`：上次停在「问题地图」
- 不设外键硬约束，避免删除 thread 时被卡住；加载时若 ID 已不存在，视为 `NULL`

### 类型

- `Book` 增加 `activeThreadId: string | null`
- 新增加载载荷：

```ts
type BookThreadsPayload = {
  threads: Array<{ thread: ReadingThread; messages: ThreadMessage[] }>;
  activeThreadId: string | null;
};
```

### 迁移

现有启动只有 `CREATE TABLE IF NOT EXISTS`，无正式迁移框架。

启动建库后对 `books` 做轻量列检查：若缺少 `active_thread_id`，执行：

```sql
ALTER TABLE books ADD COLUMN active_thread_id TEXT;
```

旧数据该列为 `NULL`（打开后停在问题地图）。

## IPC / API

### 新增 `threads.listWithMessagesByBook`

- 入参：`bookId: string`
- 出参：`BookThreadsPayload`
- 实现：
  - `listThreadsByBook(bookId)`（`updated_at DESC`）
  - 对每个 thread `listMessages(threadId)`（`created_at ASC`）
  - 读取该书 `active_thread_id`；若指向不存在的 thread，返回 `null`

### 新增 `books.setActiveThread`

- 入参：`{ bookId: string; threadId: string | null }`
- 行为：`UPDATE books SET active_thread_id = ? WHERE id = ?`
- 不更新 `updated_at` / `last_opened_at`（纯 UI 选中态）

### 既有接口

- `threads.listByBook` 可保留（兼容），阅读页改走新接口。
- `ai.runReadingAction` / `ai.followUp` / `ai.stream` 不变。

## 前端行为

### 打开书

`ReaderPage` 在 `bookId` 变化时：

1. `books.open(bookId)` 加载正文（现有）
2. `threads.listWithMessagesByBook(bookId)` 加载历史
3. `setThreads(...)`
4. 若 `activeThreadId` 在列表中 → `setActiveThreadId(activeThreadId)`；否则 → `null`

### 切换 tab

用户点击会话 tab 或「问题地图」时：

1. 立即更新本地 `activeThreadId`
2. 调用 `books.setActiveThread`
3. 写回失败不打断阅读（可静默失败）

### 新建会话

流式 `started` 事件已会把新 thread 设为当前选中；同时写回 `active_thread_id`，保证退出后仍停在刚聊的会话。

## 错误处理

- 历史加载失败：展示错误提示，正文仍可阅读；右侧可为空列表。
- 选中态写回失败：不影响当前会话展示与追问。
- `active_thread_id` 指向已删除 thread：当作 `null`，停在问题地图。

## 测试要点（手工）

1. 选中文本解释 → 退出应用 → 再打开同一本书 → 会话与消息仍在，且停在该会话。
2. 切换到另一会话 tab → 退出 → 再打开 → 停在上次点开的 tab。
3. 点「问题地图」→ 退出 → 再打开 → 停在问题地图，但会话列表仍在。
4. 追问后退出再打开 → 追问内容仍在。

## 实现范围（文件级预期）

- `src/main/storage/schema.ts` / `database.ts`：列定义与轻量迁移
- `src/main/library/LibraryService.ts`：读写 `activeThreadId`
- `src/main/threads/ThreadStore.ts`：按书返回 threads+messages
- `src/shared/types.ts` / `ipc.ts`：类型与 channel
- `src/preload/index.ts`：暴露 API
- `src/main/ipc/registerIpc.ts`：注册 handler
- `src/renderer/pages/ReaderPage.tsx`：打开时加载、切换时写回

# 阅读会话历史持久化与恢复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 打开书籍时从 SQLite 恢复历史会话与消息，并按「上次点开的 tab」恢复右侧选中态。

**Architecture:** 在 `books` 表增加 `active_thread_id`；新增按书返回 threads+messages 的 IPC；`ReaderPage` 打开时加载历史，切换 tab / 新建会话时写回选中态。不改流式回答链路。

**Tech Stack:** Electron、better-sqlite3、React、现有 `ThreadStore` / IPC / preload

**约束：** 不写自动化测试；每步用手动量验证。不使用 git worktree，直接在主工作区 `main` 分支实现。

**Spec：** `docs/specs/completed/2026-07-10-chat-history-persistence-design.md`

---

## 文件结构

| 文件 | 职责 |
|------|------|
| `src/shared/types.ts` | `Book.activeThreadId`、`BookThreadsPayload`、`SetActiveThreadInput` |
| `src/shared/ipc.ts` | 新 channel 名 |
| `src/main/storage/schema.ts` | 新库建表含 `active_thread_id` |
| `src/main/storage/database.ts` | 旧库轻量列迁移 |
| `src/main/library/LibraryService.ts` | 映射 `activeThreadId`、`setActiveThread` |
| `src/main/threads/ThreadStore.ts` | `listThreadsWithMessagesByBook` |
| `src/main/ipc/registerIpc.ts` | 注册两个新 handler |
| `src/preload/index.ts` | 暴露 renderer API |
| `src/renderer/pages/ReaderPage.tsx` | 打开加载、切换/新建写回 |

---

### Task 1: 共享类型与 IPC channel

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/shared/ipc.ts`

- [ ] **Step 1: 扩展 `Book` 与新增载荷类型**

在 `src/shared/types.ts` 的 `Book` 接口中，于 `defaultContextStrategy` 后增加：

```ts
activeThreadId: string | null;
```

在文件末尾（`AiStreamEvent` 之后）增加：

```ts
export interface BookThreadsPayload {
  threads: Array<{ thread: ReadingThread; messages: ThreadMessage[] }>;
  activeThreadId: string | null;
}

export interface SetActiveThreadInput {
  bookId: string;
  threadId: string | null;
}
```

- [ ] **Step 2: 增加 IPC channel**

在 `src/shared/ipc.ts` 的 `ipcChannels` 中，于 `threadsListByBook` 旁增加：

```ts
threadsListWithMessagesByBook: 'threads.listWithMessagesByBook',
booksSetActiveThread: 'books.setActiveThread',
```

- [ ] **Step 3: Commit**

```bash
git add src/shared/types.ts src/shared/ipc.ts
git commit -m "$(cat <<'EOF'
feat: 为会话历史恢复补充共享类型与 IPC channel

EOF
)"
```

---

### Task 2: Schema 与轻量迁移

**Files:**
- Modify: `src/main/storage/schema.ts`
- Modify: `src/main/storage/database.ts`

- [ ] **Step 1: 新库建表带上 `active_thread_id`**

在 `src/main/storage/schema.ts` 的 `books` 表定义中，于 `default_context_strategy TEXT NOT NULL` 后增加一行：

```sql
  active_thread_id TEXT
```

完整片段应类似：

```sql
CREATE TABLE IF NOT EXISTS books (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  author TEXT,
  format TEXT NOT NULL,
  original_file_path TEXT NOT NULL,
  library_file_path TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_opened_at TEXT,
  preprocess_status TEXT NOT NULL,
  token_estimate INTEGER NOT NULL,
  default_context_strategy TEXT NOT NULL,
  active_thread_id TEXT
);
```

- [ ] **Step 2: 启动时为旧库补列**

在 `src/main/storage/database.ts` 中，于 `db.exec(schemaSql);` 之后、`return db;` 之前加入：

```ts
ensureBooksActiveThreadColumn(db);
```

并在同文件增加：

```ts
function ensureBooksActiveThreadColumn(db: AppDatabase) {
  const columns = db.prepare('PRAGMA table_info(books)').all() as Array<{ name: string }>;
  const hasColumn = columns.some((column) => column.name === 'active_thread_id');
  if (!hasColumn) {
    db.exec('ALTER TABLE books ADD COLUMN active_thread_id TEXT');
  }
}
```

- [ ] **Step 3: 手工验证迁移逻辑（可选快速检查）**

若本地已有 `whisper.sqlite`，启动应用一次后，用 sqlite 查看 `books` 是否已有该列。无现成库也可跳过，Task 3 导入新书时会走新 schema。

- [ ] **Step 4: Commit**

```bash
git add src/main/storage/schema.ts src/main/storage/database.ts
git commit -m "$(cat <<'EOF'
feat: books 表增加 active_thread_id 并支持旧库迁移

EOF
)"
```

---

### Task 3: LibraryService 读写 activeThreadId

**Files:**
- Modify: `src/main/library/LibraryService.ts`

- [ ] **Step 1: 扩展 `BookRow` 与 `mapBookRow`**

`BookRow` 增加：

```ts
active_thread_id: string | null;
```

`mapBookRow` 返回对象增加：

```ts
activeThreadId: row.active_thread_id ?? null,
```

（用 `?? null`，兼容旧行/未迁移瞬间的 undefined。）

- [ ] **Step 2: 导入时写入新列**

`importMarkdown` 里构造的 `book` 对象增加：

```ts
activeThreadId: null,
```

`INSERT INTO books` 的列列表末尾增加 `active_thread_id`，`VALUES` 多一个 `?`，`.run(...)` 末尾增加 `book.activeThreadId`。

- [ ] **Step 3: 增加 `setActiveThread`**

在 `LibraryService` 类中增加：

```ts
setActiveThread(bookId: string, threadId: string | null): void {
  const result = this.db
    .prepare('UPDATE books SET active_thread_id = ? WHERE id = ?')
    .run(threadId, bookId);
  if (result.changes === 0) {
    throw new Error(`Book not found: ${bookId}`);
  }
}
```

注意：不更新 `updated_at` / `last_opened_at`。

- [ ] **Step 4: Commit**

```bash
git add src/main/library/LibraryService.ts
git commit -m "$(cat <<'EOF'
feat: LibraryService 支持读写书籍的 activeThreadId

EOF
)"
```

---

### Task 4: ThreadStore 按书返回 threads + messages

**Files:**
- Modify: `src/main/threads/ThreadStore.ts`

- [ ] **Step 1: 引入类型并实现方法**

在文件顶部 import 中增加 `BookThreadsPayload`：

```ts
import type { BookThreadsPayload, ContextStrategy, ReadingActionType, ReadingThread, ThreadMessage } from '../../shared/types';
```

在 `ThreadStore` 类中，于 `listThreadsByBook` 之后增加：

```ts
listThreadsWithMessagesByBook(bookId: string): BookThreadsPayload {
  const threads = this.listThreadsByBook(bookId);
  const bookRow = this.db.prepare('SELECT active_thread_id FROM books WHERE id = ?').get(bookId) as
    | { active_thread_id: string | null }
    | undefined;

  if (!bookRow) {
    throw new Error(`找不到书籍：${bookId}`);
  }

  const storedActiveId = bookRow.active_thread_id;
  const activeThreadId =
    storedActiveId && threads.some((thread) => thread.id === storedActiveId) ? storedActiveId : null;

  return {
    threads: threads.map((thread) => ({
      thread,
      messages: this.listMessages(thread.id),
    })),
    activeThreadId,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/main/threads/ThreadStore.ts
git commit -m "$(cat <<'EOF'
feat: ThreadStore 支持按书加载会话与完整消息

EOF
)"
```

---

### Task 5: 注册 IPC 并暴露 preload API

**Files:**
- Modify: `src/main/ipc/registerIpc.ts`
- Modify: `src/preload/index.ts`

- [ ] **Step 1: 注册 handlers**

在 `registerIpc.ts` 顶部 import 增加 `SetActiveThreadInput`：

```ts
import type { AISettings, FollowUpInput, ImportBookInput, RunReadingActionInput, SetActiveThreadInput } from '../../shared/types';
```

在现有 `threadsListByBook` handler 旁增加：

```ts
ipcMain.handle(ipcChannels.threadsListWithMessagesByBook, (_event, bookId: string) =>
  services.threads.listThreadsWithMessagesByBook(bookId),
);

ipcMain.handle(ipcChannels.booksSetActiveThread, (_event, input: SetActiveThreadInput) => {
  services.library.setActiveThread(input.bookId, input.threadId);
});
```

- [ ] **Step 2: preload 暴露 API**

在 `src/preload/index.ts` 的 import 中增加：

```ts
BookThreadsPayload,
SetActiveThreadInput,
```

在 `books` 对象中增加：

```ts
setActiveThread: (input: SetActiveThreadInput) =>
  ipcRenderer.invoke(ipcChannels.booksSetActiveThread, input) as Promise<void>,
```

在 `threads` 对象中增加：

```ts
listWithMessagesByBook: (bookId: string) =>
  ipcRenderer.invoke(ipcChannels.threadsListWithMessagesByBook, bookId) as Promise<BookThreadsPayload>,
```

- [ ] **Step 3: Commit**

```bash
git add src/main/ipc/registerIpc.ts src/preload/index.ts
git commit -m "$(cat <<'EOF'
feat: 暴露会话历史加载与选中态写回 IPC

EOF
)"
```

---

### Task 6: ReaderPage 打开时加载历史

**Files:**
- Modify: `src/renderer/pages/ReaderPage.tsx`

- [ ] **Step 1: 打开书时并行加载历史**

把现有：

```ts
useEffect(() => {
  void whisper.books.open(bookId).then(setDocument);
}, [bookId]);
```

替换为：

```ts
useEffect(() => {
  let cancelled = false;

  void (async () => {
    try {
      const [doc, history] = await Promise.all([
        whisper.books.open(bookId),
        whisper.threads.listWithMessagesByBook(bookId),
      ]);
      if (cancelled) return;
      setDocument(doc);
      setThreads(history.threads);
      setActiveThreadId(history.activeThreadId);
      setError('');
    } catch (err) {
      if (cancelled) return;
      setError(err instanceof Error ? err.message : String(err));
    }
  })();

  return () => {
    cancelled = true;
  };
}, [bookId]);
```

说明：若历史加载失败，整次 `Promise.all` 会失败；为符合 spec「正文仍可阅读」，改为分开 catch：

```ts
useEffect(() => {
  let cancelled = false;

  void (async () => {
    try {
      const doc = await whisper.books.open(bookId);
      if (cancelled) return;
      setDocument(doc);
    } catch (err) {
      if (cancelled) return;
      setError(err instanceof Error ? err.message : String(err));
      return;
    }

    try {
      const history = await whisper.threads.listWithMessagesByBook(bookId);
      if (cancelled) return;
      setThreads(history.threads);
      setActiveThreadId(history.activeThreadId);
    } catch (err) {
      if (cancelled) return;
      setThreads([]);
      setActiveThreadId(null);
      setError(err instanceof Error ? err.message : String(err));
    }
  })();

  return () => {
    cancelled = true;
  };
}, [bookId]);
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/pages/ReaderPage.tsx
git commit -m "$(cat <<'EOF'
feat: 打开书籍时加载并恢复历史会话

EOF
)"
```

---

### Task 7: 切换 tab / 新建会话时写回选中态

**Files:**
- Modify: `src/renderer/pages/ReaderPage.tsx`
- Modify: `src/renderer/components/RightAiPanel.tsx`（仅当需要改回调签名时）

- [ ] **Step 1: 在 ReaderPage 增加写回 helper**

在 `ReaderPage` 组件内增加：

```ts
async function persistActiveThread(threadId: string | null) {
  setActiveThreadId(threadId);
  try {
    await whisper.books.setActiveThread({ bookId, threadId });
  } catch {
    // 选中态写回失败不打断阅读
  }
}

function handleSelectThread(threadId: string | null) {
  void persistActiveThread(threadId);
}
```

把传给 `RightAiPanel` 的：

```ts
onSelectThread={setActiveThreadId}
```

改为：

```ts
onSelectThread={handleSelectThread}
```

- [ ] **Step 2: 新建会话时写回**

在 `ai.onStream` 的 `started` 分支里，现有：

```ts
setActiveThreadId(event.thread.id);
```

改为：

```ts
void persistActiveThread(event.thread.id);
```

注意：`persistActiveThread` 定义在组件内，而 stream effect 的依赖数组目前是 `[]`。为避免闭包陈旧 `bookId`，二选一：

**推荐 A：** 把 stream effect 的依赖改为 `[bookId]`，并在 effect 内使用当前 `bookId` 直接写回：

```ts
useEffect(() => {
  return whisper.ai.onStream((event: AiStreamEvent) => {
    if (event.type === 'started') {
      setStreamError('');
      setThreads((current) => upsertThread(current, event.thread, event.messages));
      setActiveThreadId(event.thread.id);
      void whisper.books.setActiveThread({ bookId, threadId: event.thread.id }).catch(() => undefined);
      return;
    }
    // ... chunk / done / error 保持不变
  });
}, [bookId]);
```

同时 `handleSelectThread` 仍用 `persistActiveThread`。

- [ ] **Step 3: Commit**

```bash
git add src/renderer/pages/ReaderPage.tsx
git commit -m "$(cat <<'EOF'
feat: 切换与新建会话时持久化右侧选中态

EOF
)"
```

---

### Task 8: 端到端手工验证

- [ ] **Step 1: 启动应用**

```bash
pnpm dev
```

- [ ] **Step 2: 按 spec 手工清单验证**

1. 选中文本解释 → 完全退出应用 → 再打开同一本书 → 会话与消息仍在，且停在该会话。
2. 切换到另一会话 tab → 退出 → 再打开 → 停在上次点开的 tab。
3. 点「问题地图」→ 退出 → 再打开 → 停在问题地图，会话列表仍在。
4. 追问后退出再打开 → 追问内容仍在。

- [ ] **Step 3: 若有问题则修复并追加 commit；全部通过则结束**

---

## Spec 覆盖自检

| Spec 要求 | 对应 Task |
|-----------|-----------|
| `books.active_thread_id` + 迁移 | Task 2 |
| `Book.activeThreadId` / `BookThreadsPayload` | Task 1、3 |
| `threads.listWithMessagesByBook` | Task 4、5 |
| `books.setActiveThread` | Task 3、5 |
| 打开书加载历史并恢复 tab | Task 6 |
| 切换 tab 写回 | Task 7 |
| 新建会话写回 | Task 7 |
| 写回失败不打断 / 历史失败正文可读 | Task 6、7 |
| 手工验证 4 条 | Task 8 |

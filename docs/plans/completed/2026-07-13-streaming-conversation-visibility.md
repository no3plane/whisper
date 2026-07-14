# 流式会话即时可见 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 首次发送问题后，在模型完整响应返回前立即打开新会话并逐块显示回答。

**Architecture:** 保留现有 main → preload → renderer IPC 流协议。`ReaderPage` 在处理 `started` 事件时判断该会话是否为 renderer 尚未知的新会话；仅对新会话执行打开和激活，所有事件继续由现有 `updateFromStream` 归并消息状态。

**Tech Stack:** React 19、TypeScript、Electron IPC、Vitest、Testing Library

## Global Constraints

- 面向用户沟通、设计文档、计划文档、评审总结和说明文字默认使用中文。
- 不创建或使用 git worktree；直接在主工作区 `main` 分支开发、验证和提交。
- 不修改现有 IPC 事件结构。
- 追问和重试的 `started` 事件不得抢占用户当前视图。

---

### Task 1: 首次流事件立即打开会话

**Files:**

- Modify: `tests/renderer/ReaderPage.test.tsx`
- Modify: `src/renderer/pages/ReaderPage.tsx`

**Interfaces:**

- Consumes: `AiStreamEvent` 的 `started`、`chunk` 事件和现有 `updateFromStream(event, setThreads)`。
- Produces: `handleStreamEvent(event: AiStreamEvent)`，负责状态归并，并仅在首次出现的 `started` 会话上更新 `openThreadIds` 与 `activeView`。

- [x] **Step 1: 写出失败的 renderer 回归测试**

在 `tests/renderer/ReaderPage.test.tsx` 增加测试，使用 pending Promise 模拟未完成请求：

```tsx
it('首次发送在请求完成前打开会话并显示流式内容', async () => {
  let resolveCreate!: (value: { thread: ReadingThread; messages: ThreadMessage[] }) => void;
  api.ai.createConversation.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveCreate = resolve;
    }),
  );
  render(<ReaderPage bookId="b1" onBack={vi.fn()} />);
  await screen.findByText('所谓自由并不是任性。');
  fireEvent.click(screen.getByRole('button', { name: '新建会话' }));
  fireEvent.change(screen.getByPlaceholderText('你想了解什么？'), {
    target: { value: '全书讲了什么？' },
  });
  fireEvent.click(screen.getByRole('button', { name: '发送首次问题' }));

  listeners.forEach((listener) =>
    listener({ type: 'started', thread, messages: [assistant], assistantMessageId: assistant.id }),
  );
  expect(await screen.findByText('模型思考中…')).toBeTruthy();

  listeners.forEach((listener) =>
    listener({ type: 'chunk', threadId: thread.id, messageId: assistant.id, chunk: '部分回答' }),
  );
  expect(await screen.findByText('部分回答')).toBeTruthy();

  resolveCreate({
    thread: { ...thread, status: 'ready' },
    messages: [{ ...assistant, content: '部分回答', status: 'complete' }],
  });
});
```

- [x] **Step 2: 运行单测并确认按预期失败**

Run: `pnpm exec vitest run tests/renderer/ReaderPage.test.tsx -t "首次发送在请求完成前打开会话并显示流式内容"`

Expected: FAIL，找不到“模型思考中…”，证明 `started` 尚未切换视图。

- [x] **Step 3: 实现最小的流事件编排**

在 `ReaderPage` 中用 ref 保存最新会话集合，避免事件回调捕获旧状态：

```tsx
const threadsRef = useRef<ThreadItem[]>([]);
useEffect(() => {
  threadsRef.current = threads;
}, [threads]);

function handleStreamEvent(event: AiStreamEvent) {
  const isNewConversation =
    event.type === 'started' &&
    !threadsRef.current.some((item) => item.thread.id === event.thread.id);
  updateFromStream(event, setThreads);
  if (!isNewConversation) return;
  setOpenThreadIds((ids) => (ids.includes(event.thread.id) ? ids : [...ids, event.thread.id]));
  selectThread(event.thread.id);
}
```

并把订阅改为：

```tsx
useEffect(() => whisper.ai.onStream(handleStreamEvent), []);
```

为保证 effect 订阅稳定且不依赖每次 render 创建的函数，最终实现可将 `handleStreamEvent` 的逻辑直接放入一次性订阅 effect，并通过 `threadsRef` 判断。

- [x] **Step 4: 运行目标测试并确认通过**

Run: `pnpm exec vitest run tests/renderer/ReaderPage.test.tsx -t "首次发送在请求完成前打开会话并显示流式内容"`

Expected: PASS。

- [x] **Step 5: 增加既有会话不被 started 抢占的测试**

在同一测试文件增加：

```tsx
it('既有会话的 started 事件不抢占当前视图', async () => {
  const other = { ...thread, id: 't2', title: '当前查看', status: 'ready' as const };
  api.threads.listWithMessagesByBook.mockResolvedValueOnce({
    threads: [
      { thread, messages: [assistant] },
      { thread: other, messages: [] },
    ],
    activeThreadId: 't2',
  });
  localStorage.setItem('whisper.openThreads.b1', JSON.stringify(['t1', 't2']));
  render(<ReaderPage bookId="b1" onBack={vi.fn()} />);
  await screen.findByText('当前查看');
  listeners.forEach((listener) =>
    listener({ type: 'started', thread, messages: [assistant], assistantMessageId: assistant.id }),
  );
  expect(screen.getByText('当前查看')).toBeTruthy();
  expect(screen.queryByText('模型思考中…')).toBeNull();
});
```

- [x] **Step 6: 运行 ReaderPage 完整测试**

Run: `pnpm exec vitest run tests/renderer/ReaderPage.test.tsx`

Expected: 该文件全部测试 PASS。

- [x] **Step 7: 运行全量验证**

Run: `pnpm test && pnpm run lint:types && pnpm run build`

Expected: 所有测试通过，TypeScript 无错误，Electron 构建成功。

- [x] **Step 8: 提交修复**

```bash
git add src/renderer/pages/ReaderPage.tsx tests/renderer/ReaderPage.test.tsx docs/plans/completed/2026-07-13-streaming-conversation-visibility.md
git commit -m "fix: 首次发送立即显示流式会话"
```

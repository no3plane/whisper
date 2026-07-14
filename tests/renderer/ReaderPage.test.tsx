import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReaderPage } from '../../src/renderer/pages/reader-page/ReaderPage';
import type {
  AiStreamEvent,
  BookDocument,
  ReadingThread,
  ThreadMessage,
} from '../../src/shared/types';
import panelStyles from '../../src/renderer/features/conversation/RightAiPanel.module.css';
import readerStyles from '../../src/renderer/pages/reader-page/ReaderPage.module.css';

const { listeners, api } = vi.hoisted(() => {
  const listeners = new Set<(event: AiStreamEvent) => void>();
  const api = {
    books: { open: vi.fn(), setActiveThread: vi.fn(), setContextStrategy: vi.fn() },
    threads: { listWithMessagesByBook: vi.fn(), listByBook: vi.fn(), delete: vi.fn() },
    ai: {
      createConversation: vi.fn(),
      followUp: vi.fn(),
      retry: vi.fn(),
      onStream: vi.fn((listener: (event: AiStreamEvent) => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      }),
    },
  };
  return { listeners, api };
});
const target = {
  type: 'book' as const,
  chapterId: null,
  startPassageId: null,
  endPassageId: null,
  selectedText: '',
  startOffset: null,
  endOffset: null,
  breadcrumb: [],
};
const thread: ReadingThread = {
  id: 't1',
  bookId: 'b1',
  title: '全书 · 问题',
  target,
  skillType: null,
  contextStrategy: 'hybrid',
  createdAt: '2026-07-13T00:00:00Z',
  updatedAt: '2026-07-13T00:00:00Z',
  status: 'streaming',
  lastError: null,
};
const assistant: ThreadMessage = {
  id: 'a1',
  threadId: 't1',
  role: 'assistant',
  content: '',
  createdAt: '2026-07-13T00:00:00Z',
  model: null,
  tokenUsage: null,
  contextStrategy: null,
  effectiveContextStrategy: null,
  degradationReason: null,
  reference: null,
  status: 'streaming',
  error: null,
};
const bookDocument: BookDocument = {
  book: {
    id: 'b1',
    title: '测试书',
    author: null,
    format: 'markdown',
    originalFilePath: '',
    libraryFilePath: '',
    createdAt: '',
    updatedAt: '',
    lastOpenedAt: null,
    preprocessStatus: 'ready',
    tokenEstimate: 1,
    defaultContextStrategy: 'hybrid',
    activeThreadId: null,
  },
  chapters: [
    {
      id: 'c1',
      bookId: 'b1',
      parentChapterId: null,
      title: '第一章',
      level: 1,
      order: 0,
      startPassageId: 'p1',
      endPassageId: 'p1',
      summary: null,
    },
  ],
  passages: [
    {
      id: 'p1',
      bookId: 'b1',
      chapterId: 'c1',
      order: 0,
      text: '所谓自由并不是任性。',
      sourceHref: null,
      sourceOffset: 0,
    },
  ],
  fullText: '所谓自由并不是任性。',
};

vi.mock('../../src/renderer/api/whisper', () => ({ whisper: api }));

const originalResizeObserver = globalThis.ResizeObserver;
const originalScrollTo = HTMLElement.prototype.scrollTo;
beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  HTMLElement.prototype.scrollTo = vi.fn();
});
afterAll(() => {
  globalThis.ResizeObserver = originalResizeObserver;
  HTMLElement.prototype.scrollTo = originalScrollTo;
});
beforeEach(() => {
  localStorage.clear();
  listeners.clear();
  vi.clearAllMocks();
  api.books.open.mockResolvedValue(bookDocument);
  api.books.setActiveThread.mockResolvedValue(undefined);
  api.books.setContextStrategy.mockResolvedValue(undefined);
  api.threads.listWithMessagesByBook.mockResolvedValue({ threads: [], activeThreadId: null });
  api.threads.listByBook.mockResolvedValue([]);
  api.threads.delete.mockResolvedValue(undefined);
  api.ai.createConversation.mockResolvedValue({ thread, messages: [assistant] });
  api.ai.followUp.mockResolvedValue({ thread, messages: [assistant] });
  api.ai.retry.mockResolvedValue({ thread, messages: [assistant] });
});
afterEach(cleanup);

describe('ReaderPage 会话编排', () => {
  it('以原书为主区域并保留目录和 AI 辅助区域', async () => {
    render(<ReaderPage bookId="b1" onBack={vi.fn()} />);
    expect(await screen.findByRole('article', { name: '阅读正文' })).toBeTruthy();
    expect(screen.getByRole('navigation', { name: '书籍目录' })).toBeTruthy();
    expect(screen.getAllByRole('complementary', { name: '书旁低语' })).toHaveLength(1);
    expect(screen.getByRole('heading', { name: bookDocument.book.title })).toBeTruthy();
  });

  it('打开书籍期间显示与阅读面一致的加载状态', () => {
    api.books.open.mockReturnValueOnce(new Promise(() => undefined));
    render(<ReaderPage bookId="b1" onBack={vi.fn()} />);
    expect(screen.getByRole('status').textContent).toContain('正在打开书籍');
  });

  it('打开书籍失败后结束忙碌状态并展示错误', async () => {
    api.books.open.mockRejectedValueOnce(new Error('书籍损坏'));
    render(<ReaderPage bookId="b1" onBack={vi.fn()} />);

    expect((await screen.findByRole('alert')).textContent).toContain('书籍损坏');
    expect(screen.getByRole('main').getAttribute('aria-busy')).toBe('false');
  });

  it('没有保存过 Tab 状态时默认打开有效的 activeThreadId', async () => {
    api.threads.listWithMessagesByBook.mockResolvedValueOnce({
      threads: [{ thread: { ...thread, status: 'ready' }, messages: [] }],
      activeThreadId: 't1',
    });
    render(<ReaderPage bookId="b1" onBack={vi.fn()} />);
    expect(await screen.findByRole('button', { name: '回到原文' })).toBeTruthy();
  });

  it('activeThreadId 与历史首条不同时只打开 active 会话', async () => {
    const first = { ...thread, id: 'first', title: '首条会话', status: 'ready' as const };
    const active = { ...thread, id: 'active', title: '活跃会话', status: 'ready' as const };
    api.threads.listWithMessagesByBook.mockResolvedValueOnce({
      threads: [
        { thread: first, messages: [] },
        { thread: active, messages: [] },
      ],
      activeThreadId: 'active',
    });
    render(<ReaderPage bookId="b1" onBack={vi.fn()} />);
    expect(await screen.findByRole('button', { name: '关闭“活跃会话”' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '关闭“首条会话”' })).toBeNull();
  });

  it('保存的空 Tab 数组保持全部关闭', async () => {
    localStorage.setItem('whisper.openThreads.b1', '[]');
    api.threads.listWithMessagesByBook.mockResolvedValueOnce({
      threads: [{ thread: { ...thread, status: 'ready' }, messages: [] }],
      activeThreadId: 't1',
    });
    render(<ReaderPage bookId="b1" onBack={vi.fn()} />);
    await screen.findByText('所谓自由并不是任性。');
    expect(screen.queryByRole('button', { name: '回到原文' })).toBeNull();
  });
  it('点击加号不创建会话，首次发送才创建', async () => {
    render(<ReaderPage bookId="b1" onBack={vi.fn()} />);
    await screen.findByText('所谓自由并不是任性。');
    fireEvent.click(screen.getByRole('button', { name: '新建会话' }));
    expect(api.ai.createConversation).not.toHaveBeenCalled();
    fireEvent.change(screen.getByPlaceholderText('你想了解什么？'), {
      target: { value: '全书讲了什么？' },
    });
    fireEvent.click(screen.getByRole('button', { name: '发送首次问题' }));
    await waitFor(() => expect(api.ai.createConversation).toHaveBeenCalledOnce());
  });

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
      listener({
        type: 'started',
        thread,
        messages: [assistant],
        assistantMessageId: assistant.id,
      }),
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
    const activeTab = await screen.findByRole('button', { name: '当前查看' });

    listeners.forEach((listener) =>
      listener({
        type: 'started',
        thread,
        messages: [assistant],
        assistantMessageId: assistant.id,
      }),
    );

    expect(activeTab.classList.contains(panelStyles.active)).toBe(true);
    expect(screen.queryByText('模型思考中…')).toBeNull();
  });

  it('忽略其他书籍的流事件', async () => {
    render(<ReaderPage bookId="b1" onBack={vi.fn()} />);
    await screen.findByText('所谓自由并不是任性。');
    const foreignThread = { ...thread, id: 'foreign', bookId: 'b2', title: '其他书会话' };

    listeners.forEach((listener) =>
      listener({
        type: 'started',
        thread: foreignThread,
        messages: [{ ...assistant, id: 'foreign-message', threadId: 'foreign' }],
        assistantMessageId: 'foreign-message',
      }),
    );
    listeners.forEach((listener) =>
      listener({
        type: 'done',
        thread: { ...foreignThread, status: 'ready' },
        messages: [],
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: '历史' }));
    expect(screen.queryByText('其他书会话')).toBeNull();
  });

  it('关闭生成中的 Tab 后仍接收 chunk 和 done', async () => {
    api.threads.listWithMessagesByBook.mockResolvedValueOnce({
      threads: [{ thread, messages: [assistant] }],
      activeThreadId: 't1',
    });
    localStorage.setItem('whisper.openThreads.b1', JSON.stringify(['t1']));
    render(<ReaderPage bookId="b1" onBack={vi.fn()} />);
    await screen.findByRole('button', { name: '关闭“全书 · 问题”' });
    fireEvent.click(screen.getByRole('button', { name: '关闭“全书 · 问题”' }));
    listeners.forEach((listener) =>
      listener({ type: 'chunk', threadId: 't1', messageId: 'a1', chunk: '后台回答' }),
    );
    listeners.forEach((listener) =>
      listener({
        type: 'done',
        thread: { ...thread, status: 'ready' },
        messages: [{ ...assistant, content: '后台回答', status: 'complete' }],
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: '历史' }));
    await waitFor(() => expect(screen.getByText('全书 · 问题')).toBeTruthy());
    fireEvent.click(screen.getAllByRole('button', { name: '全书 · 问题' }).at(-1)!);
    expect(await screen.findByText('后台回答')).toBeTruthy();
  });

  it('打开历史会话不滚动，点击回到原文才滚动', async () => {
    const scroll = vi.fn();
    HTMLElement.prototype.scrollIntoView = scroll;
    api.threads.listWithMessagesByBook.mockResolvedValueOnce({
      threads: [
        {
          thread: { ...thread, status: 'ready' },
          messages: [{ ...assistant, status: 'complete' }],
        },
      ],
      activeThreadId: null,
    });
    localStorage.setItem('whisper.openThreads.b1', '[]');
    render(<ReaderPage bookId="b1" onBack={vi.fn()} />);
    await screen.findByText('所谓自由并不是任性。');
    fireEvent.click(screen.getByRole('button', { name: '历史' }));
    fireEvent.click(screen.getByRole('button', { name: '全书 · 问题' }));
    expect(scroll).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '回到原文' }));
    expect(scroll).toHaveBeenCalledOnce();
  });

  it('手动选择章节目标后以章节目标创建会话', async () => {
    render(<ReaderPage bookId="b1" onBack={vi.fn()} />);
    await screen.findByText('所谓自由并不是任性。');
    fireEvent.click(screen.getByRole('button', { name: '新建会话' }));
    const text = screen.getByText('所谓自由并不是任性。').firstChild!;
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, 4);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    fireEvent.mouseUp(screen.getByText('所谓自由并不是任性。'));
    fireEvent.click(await screen.findByRole('button', { name: '第一章' }));
    fireEvent.change(screen.getByPlaceholderText('你想了解什么？'), {
      target: { value: '解释本章' },
    });
    fireEvent.click(screen.getByRole('button', { name: '发送首次问题' }));
    await waitFor(() =>
      expect(api.ai.createConversation).toHaveBeenCalledWith(
        expect.objectContaining({
          target: expect.objectContaining({ type: 'chapter', chapterId: 'c1' }),
        }),
      ),
    );
  });

  it('关闭活动 Tab 后激活相邻 Tab 并清除待发送引用', async () => {
    const t2 = { ...thread, id: 't2', title: '第二个会话', status: 'ready' as const };
    api.threads.listWithMessagesByBook.mockResolvedValueOnce({
      threads: [
        { thread: { ...thread, status: 'ready' }, messages: [] },
        { thread: t2, messages: [] },
      ],
      activeThreadId: 't2',
    });
    localStorage.setItem('whisper.openThreads.b1', JSON.stringify(['t1', 't2']));
    render(<ReaderPage bookId="b1" onBack={vi.fn()} />);
    await screen.findByText('第二个会话');
    fireEvent.click(screen.getByRole('button', { name: '关闭“第二个会话”' }));
    expect(await screen.findByText('全书认知：hybrid')).toBeTruthy();
  });

  it('精确选区定位时恢复 Range，2 秒后清理且不提示降级', async () => {
    const selectionTarget = {
      ...target,
      type: 'selection' as const,
      chapterId: 'c1',
      startPassageId: 'p1',
      endPassageId: 'p1',
      selectedText: '自由',
      startOffset: 2,
      endOffset: 4,
      breadcrumb: [{ chapterId: 'c1', title: '第一章' }],
    };
    api.threads.listWithMessagesByBook.mockResolvedValueOnce({
      threads: [{ thread: { ...thread, target: selectionTarget, status: 'ready' }, messages: [] }],
      activeThreadId: 't1',
    });
    localStorage.setItem('whisper.openThreads.b1', JSON.stringify(['t1']));
    render(<ReaderPage bookId="b1" onBack={vi.fn()} />);
    await screen.findByRole('button', { name: '回到原文' });
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: '回到原文' }));
    expect(window.getSelection()?.toString()).toBe('自由');
    expect(screen.queryByText('无法恢复精确选区，已定位到相关段落。')).toBeNull();
    vi.advanceTimersByTime(2000);
    expect(window.getSelection()?.rangeCount).toBe(0);
    vi.useRealTimers();
  });

  it('连续定位时先清理上一次降级高亮再创建精确高亮', async () => {
    const fallbackTarget = {
      ...target,
      type: 'selection' as const,
      chapterId: 'c1',
      startPassageId: 'p1',
      endPassageId: 'p1',
      selectedText: '不存在',
      startOffset: 0,
      endOffset: 2,
      breadcrumb: [{ chapterId: 'c1', title: '第一章' }],
    };
    const exactTarget = { ...fallbackTarget, selectedText: '自由', startOffset: 2, endOffset: 4 };
    const exactThread = {
      ...thread,
      id: 't2',
      title: '精确定位',
      target: exactTarget,
      status: 'ready' as const,
    };
    api.threads.listWithMessagesByBook.mockResolvedValueOnce({
      threads: [
        { thread: { ...thread, target: fallbackTarget, status: 'ready' }, messages: [] },
        { thread: exactThread, messages: [] },
      ],
      activeThreadId: 't1',
    });
    localStorage.setItem('whisper.openThreads.b1', JSON.stringify(['t1', 't2']));
    render(<ReaderPage bookId="b1" onBack={vi.fn()} />);
    await screen.findByRole('button', { name: '回到原文' });
    fireEvent.click(screen.getByRole('button', { name: '回到原文' }));
    const passage = screen.getByText('所谓自由并不是任性。');
    expect(passage.classList.contains(readerStyles.temporarySourceHighlight)).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '精确定位' }));
    fireEvent.click(screen.getByRole('button', { name: '回到原文' }));
    expect(passage.classList.contains(readerStyles.temporarySourceHighlight)).toBe(false);
    expect(window.getSelection()?.toString()).toBe('自由');
  });

  it('切换到历史时清除当前会话的待发送引用', async () => {
    api.threads.listWithMessagesByBook.mockResolvedValueOnce({
      threads: [{ thread: { ...thread, status: 'ready' }, messages: [] }],
      activeThreadId: 't1',
    });
    localStorage.setItem('whisper.openThreads.b1', JSON.stringify(['t1']));
    render(<ReaderPage bookId="b1" onBack={vi.fn()} />);
    await screen.findByText('所谓自由并不是任性。');
    const text = screen.getByText('所谓自由并不是任性。').firstChild!;
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, 2);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    fireEvent.mouseUp(screen.getByText('所谓自由并不是任性。'));
    fireEvent.click(screen.getByRole('button', { name: '引用到当前会话' }));
    expect(document.querySelector(`.${panelStyles.pendingReference} blockquote`)?.textContent).toBe(
      '所谓',
    );
    fireEvent.click(screen.getByRole('button', { name: '历史' }));
    fireEvent.click(screen.getAllByRole('button', { name: '全书 · 问题' }).at(-1)!);
    expect(document.querySelector(`.${panelStyles.pendingReference}`)).toBeNull();
  });

  it('历史中仅当存在失败的助手消息时展示重试', async () => {
    api.threads.listWithMessagesByBook.mockResolvedValueOnce({
      threads: [
        {
          thread: { ...thread, status: 'failed' },
          messages: [{ ...assistant, role: 'user', status: 'failed' }],
        },
      ],
      activeThreadId: null,
    });
    render(<ReaderPage bookId="b1" onBack={vi.fn()} />);
    await screen.findByText('所谓自由并不是任性。');
    fireEvent.click(screen.getByRole('button', { name: '历史' }));
    expect(screen.queryByRole('button', { name: '重试“全书 · 问题”' })).toBeNull();
  });
});

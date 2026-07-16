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
import { analyzeMarkdown } from '../../src/shared/markdown/analyzeMarkdown';

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
  start: null,
  end: null,
  selectedText: '',
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
      headingBlockId: 'p1',
      sourceStart: 0,
      sourceEnd: 30,
    },
  ],
  markdown: '# 第一章\n\n所谓自由并不是任性。',
  blocks: [
    {
      id: 'p1',
      chapterId: 'c1',
      order: 0,
      type: 'heading',
      sourceStart: 0,
      sourceEnd: 5,
      markdown: '# 第一章',
      plainText: '第一章',
    },
    {
      id: 'p-body',
      chapterId: 'c1',
      order: 1,
      type: 'paragraph',
      sourceStart: 7,
      sourceEnd: 18,
      markdown: '所谓自由并不是任性。',
      plainText: '所谓自由并不是任性。',
    },
  ],
  resources: {},
  fullText: '所谓自由并不是任性。',
};

function analyzedDocument(markdown: string): BookDocument {
  const analysis = analyzeMarkdown({ bookId: 'b1', markdown });
  return {
    ...bookDocument,
    markdown,
    chapters: analysis.chapters,
    blocks: analysis.blocks,
    fullText: analysis.structuredText,
  };
}

vi.mock('../../src/renderer/api/whisper', () => ({ whisper: api }));

const originalResizeObserver = globalThis.ResizeObserver;
const originalScrollTo = HTMLElement.prototype.scrollTo;
const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  HTMLElement.prototype.scrollTo = vi.fn();
  HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterAll(() => {
  globalThis.ResizeObserver = originalResizeObserver;
  HTMLElement.prototype.scrollTo = originalScrollTo;
  HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
});
beforeEach(() => {
  localStorage.clear();
  window.getSelection()?.removeAllRanges();
  HTMLElement.prototype.scrollIntoView = vi.fn();
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

  it('渲染层级目录并把标题导航和折叠操作分开', async () => {
    const scroll = vi.fn();
    HTMLElement.prototype.scrollIntoView = scroll;
    api.books.open.mockResolvedValueOnce({
      ...bookDocument,
      chapters: [
        { ...bookDocument.chapters[0], id: 'part', title: '第一部', headingBlockId: 'p1' },
        {
          ...bookDocument.chapters[0],
          id: 'chapter',
          parentChapterId: 'part',
          title: '第一章',
          order: 1,
          headingBlockId: 'p2',
        },
      ],
      blocks: [
        bookDocument.blocks[0],
        { ...bookDocument.blocks[0], id: 'p2', chapterId: 'chapter', order: 1 },
      ],
    });
    render(<ReaderPage bookId="b1" onBack={vi.fn()} />);

    const toggle = await screen.findByRole('button', { name: /“第一部”/ });
    if (toggle.getAttribute('aria-expanded') === 'false') {
      fireEvent.click(toggle);
    }
    fireEvent.click(await screen.findByRole('link', { name: '第一章' }));
    expect(scroll).toHaveBeenCalledWith({ behavior: 'instant', block: 'start' });
    fireEvent.click(screen.getByRole('button', { name: '折叠“第一部”' }));
    expect(scroll).toHaveBeenCalledOnce();
  });

  it('目录导航滚动期间锁定目标分支，不展开沿途分支', async () => {
    const scroll = vi.fn();
    HTMLElement.prototype.scrollIntoView = scroll;
    const navigationDocument = analyzedDocument(
      '# Part 1\n\n# Part 2\n\n## Part 2 小节\n\n# Part 7\n\n## Part 7 小节',
    );
    const blockId = (title: string) =>
      navigationDocument.chapters.find((chapter) => chapter.title === title)!.headingBlockId;
    let scrollPosition = 'start';
    const rect = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        const topById: Record<string, number> =
          scrollPosition === 'start'
            ? { [blockId('Part 1')]: -10, [blockId('Part 2')]: 200, [blockId('Part 7')]: 400 }
            : { [blockId('Part 1')]: -400, [blockId('Part 2')]: -10, [blockId('Part 7')]: 200 };
        return { top: topById[this.id] ?? 0 } as DOMRect;
      });
    api.books.open.mockResolvedValueOnce(navigationDocument);
    render(<ReaderPage bookId="b1" onBack={vi.fn()} />);

    fireEvent.click(await screen.findByRole('link', { name: 'Part 7' }));
    expect(screen.getByRole('link', { name: 'Part 7' }).getAttribute('aria-current')).toBe(
      'location',
    );
    scrollPosition = 'middle';
    fireEvent.scroll(screen.getByRole('main'));
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Part 7' }).getAttribute('aria-current')).toBe(
        'location',
      ),
    );
    expect(screen.queryByRole('link', { name: 'Part 2 小节' })).toBeNull();
    expect(scroll).toHaveBeenCalledOnce();
    fireEvent(screen.getByRole('main'), new Event('scrollend'));
    expect(await screen.findByRole('link', { name: 'Part 2 小节' })).toBeTruthy();
    rect.mockRestore();
  });

  it('第五层正文由第四层目录项承接当前位置', async () => {
    const chapters = Array.from({ length: 5 }, (_, index) => ({
      ...bookDocument.chapters[0],
      id: `level-${index + 1}`,
      parentChapterId: index === 0 ? null : `level-${index}`,
      title: `第${index + 1}层`,
      order: index,
      headingBlockId: 'deep-passage',
    }));
    api.books.open.mockResolvedValueOnce({
      ...bookDocument,
      chapters,
      blocks: [
        {
          ...bookDocument.blocks[0],
          id: 'deep-passage',
          chapterId: 'level-5',
        },
      ],
    });
    render(<ReaderPage bookId="b1" onBack={vi.fn()} />);

    expect(await screen.findByRole('link', { name: '第4层' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: '第5层' })).toBeNull();
    expect(screen.getByRole('link', { name: '第4层' }).getAttribute('aria-current')).toBe(
      'location',
    );
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

  it('回到原文产生的程序化选区不触发选区操作', async () => {
    const selectionThread = {
      ...thread,
      target: {
        type: 'selection' as const,
        chapterId: 'c1',
        start: { blockId: 'p-body', offsetInBlock: 0 },
        end: { blockId: 'p-body', offsetInBlock: 4 },
        selectedText: '所谓自由',
        breadcrumb: [],
      },
      status: 'ready' as const,
    };
    api.threads.listWithMessagesByBook.mockResolvedValueOnce({
      threads: [{ thread: selectionThread, messages: [] }],
      activeThreadId: 't1',
    });
    render(<ReaderPage bookId="b1" onBack={vi.fn()} />);
    await screen.findByText('所谓自由并不是任性。');

    fireEvent.click(screen.getByRole('button', { name: '回到原文' }));
    fireEvent(document, new Event('selectionchange'));

    expect(screen.queryByRole('toolbar', { name: '选区操作' })).toBeNull();
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
    fireEvent(document, new Event('selectionchange'));
    fireEvent.click(screen.getByRole('button', { name: '提问' }));
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

  it('浏览器在 mouseup 后折叠选区时清除选区菜单', async () => {
    render(<ReaderPage bookId="b1" onBack={vi.fn()} />);
    await screen.findByText('所谓自由并不是任性。');
    fireEvent.click(screen.getByRole('button', { name: '新建会话' }));
    const paragraph = screen.getByText('所谓自由并不是任性。');
    const text = paragraph.firstChild!;
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, 4);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    fireEvent(document, new Event('selectionchange'));
    expect(screen.getByRole('button', { name: '提问' })).toBeTruthy();

    const collapsedRange = document.createRange();
    collapsedRange.setStart(text, 4);
    collapsedRange.collapse(true);
    selection.removeAllRanges();
    selection.addRange(collapsedRange);
    fireEvent(document, new Event('selectionchange'));

    expect(screen.queryByRole('button', { name: '提问' })).toBeNull();
    expect(screen.getByText('完整全书')).toBeTruthy();
  });

  it('鼠标拖动选择期间不挂载提问按钮，松开后才显示', async () => {
    render(<ReaderPage bookId="b1" onBack={vi.fn()} />);
    const paragraph = await screen.findByText('所谓自由并不是任性。');
    const text = paragraph.firstChild!;
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, 4);

    fireEvent.pointerDown(paragraph);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    fireEvent(document, new Event('selectionchange'));

    expect(screen.queryByRole('button', { name: '提问' })).toBeNull();

    fireEvent.pointerUp(document);
    expect(screen.getByRole('button', { name: '提问' })).toBeTruthy();
  });

  it('点击提问后才把临时选区写入草稿并保留输入', async () => {
    render(<ReaderPage bookId="b1" onBack={vi.fn()} />);
    const paragraph = await screen.findByText('所谓自由并不是任性。');
    fireEvent.click(screen.getByRole('button', { name: '新建会话' }));
    fireEvent.change(screen.getByPlaceholderText('你想了解什么？'), {
      target: { value: '这句话是什么意思？' },
    });

    const range = document.createRange();
    range.setStart(paragraph.firstChild!, 0);
    range.setEnd(paragraph.firstChild!, 4);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    fireEvent(document, new Event('selectionchange'));

    expect(screen.getByText('完整全书')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '框选内容' })).toBeNull();

    const askButton = screen.getByRole('button', { name: '提问' });
    fireEvent.pointerDown(askButton);
    expect(screen.getByRole('button', { name: '提问' })).toBeTruthy();
    fireEvent.pointerUp(askButton);
    fireEvent.click(askButton);
    expect(screen.getByRole('button', { name: '框选内容' })).toBeTruthy();
    expect((screen.getByPlaceholderText('你想了解什么？') as HTMLTextAreaElement).value).toBe(
      '这句话是什么意思？',
    );
  });

  it('浏览器清空正文选区的所有 Range 时清除选区状态', async () => {
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
    fireEvent(document, new Event('selectionchange'));
    expect(screen.getByRole('button', { name: '提问' })).toBeTruthy();

    selection.removeAllRanges();
    fireEvent(document, new Event('selectionchange'));

    expect(screen.queryByRole('button', { name: '提问' })).toBeNull();
    expect(screen.getByText('完整全书')).toBeTruthy();
  });

  it('阅读正文外的选区变化不影响临时正文选区或当前草稿', async () => {
    render(<ReaderPage bookId="b1" onBack={vi.fn()} />);
    await screen.findByText('所谓自由并不是任性。');
    fireEvent.click(screen.getByRole('button', { name: '新建会话' }));
    const paragraphText = screen.getByText('所谓自由并不是任性。').firstChild!;
    const selection = window.getSelection()!;
    const readingRange = document.createRange();
    readingRange.setStart(paragraphText, 0);
    readingRange.setEnd(paragraphText, 4);
    selection.removeAllRanges();
    selection.addRange(readingRange);
    fireEvent(document, new Event('selectionchange'));
    expect(screen.getByRole('button', { name: '提问' })).toBeTruthy();

    const panelText = screen.getByText('WHISPER').firstChild!;
    const panelRange = document.createRange();
    panelRange.selectNodeContents(panelText);
    selection.removeAllRanges();
    selection.addRange(panelRange);
    fireEvent(document, new Event('selectionchange'));

    expect(screen.getByRole('button', { name: '提问' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '框选内容' })).toBeNull();
    expect(screen.getByText('完整全书')).toBeTruthy();
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

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReaderPage } from '../../src/renderer/pages/ReaderPage';
import type { AiStreamEvent, BookDocument, ReadingThread, ThreadMessage } from '../../src/shared/types';

const { listeners, api } = vi.hoisted(() => {
  const listeners = new Set<(event: AiStreamEvent) => void>();
  const api = {
    books: { open: vi.fn(), setActiveThread: vi.fn(), setContextStrategy: vi.fn() },
    threads: { listWithMessagesByBook: vi.fn(), listByBook: vi.fn(), delete: vi.fn() },
    ai: { createConversation: vi.fn(), followUp: vi.fn(), retry: vi.fn(), onStream: vi.fn((listener: (event: AiStreamEvent) => void) => { listeners.add(listener); return () => listeners.delete(listener); }) },
  };
  return { listeners, api };
});
const target = { type: 'book' as const, chapterId: null, startPassageId: null, endPassageId: null, selectedText: '', startOffset: null, endOffset: null, breadcrumb: [] };
const thread: ReadingThread = { id: 't1', bookId: 'b1', title: '全书 · 问题', target, skillType: null, contextStrategy: 'hybrid', createdAt: '2026-07-13T00:00:00Z', updatedAt: '2026-07-13T00:00:00Z', status: 'streaming', lastError: null };
const assistant: ThreadMessage = { id: 'a1', threadId: 't1', role: 'assistant', content: '', createdAt: '2026-07-13T00:00:00Z', model: null, tokenUsage: null, contextStrategy: null, reference: null, status: 'streaming', error: null };
const document: BookDocument = {
  book: { id: 'b1', title: '测试书', author: null, format: 'markdown', originalFilePath: '', libraryFilePath: '', createdAt: '', updatedAt: '', lastOpenedAt: null, preprocessStatus: 'ready', tokenEstimate: 1, defaultContextStrategy: 'hybrid', activeThreadId: null },
  chapters: [{ id: 'c1', bookId: 'b1', parentChapterId: null, title: '第一章', level: 1, order: 0, startPassageId: 'p1', endPassageId: 'p1', summary: null }],
  passages: [{ id: 'p1', bookId: 'b1', chapterId: 'c1', order: 0, text: '所谓自由并不是任性。', sourceHref: null, sourceOffset: 0 }], fullText: '所谓自由并不是任性。',
};

vi.mock('../../src/renderer/api/whisper', () => ({ whisper: api }));

const originalResizeObserver = globalThis.ResizeObserver;
const originalScrollTo = HTMLElement.prototype.scrollTo;
beforeAll(() => {
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  HTMLElement.prototype.scrollTo = vi.fn();
});
afterAll(() => { globalThis.ResizeObserver = originalResizeObserver; HTMLElement.prototype.scrollTo = originalScrollTo; });
beforeEach(() => {
  localStorage.clear(); listeners.clear(); vi.clearAllMocks();
  api.books.open.mockResolvedValue(document); api.books.setActiveThread.mockResolvedValue(undefined); api.books.setContextStrategy.mockResolvedValue(undefined);
  api.threads.listWithMessagesByBook.mockResolvedValue({ threads: [], activeThreadId: null }); api.threads.listByBook.mockResolvedValue([]); api.threads.delete.mockResolvedValue(undefined);
  api.ai.createConversation.mockResolvedValue({ thread, messages: [assistant] }); api.ai.followUp.mockResolvedValue({ thread, messages: [assistant] }); api.ai.retry.mockResolvedValue({ thread, messages: [assistant] });
});
afterEach(cleanup);

describe('ReaderPage 会话编排', () => {
  it('点击加号不创建会话，首次发送才创建', async () => {
    render(<ReaderPage bookId="b1" onBack={vi.fn()} />);
    await screen.findByText('所谓自由并不是任性。');
    fireEvent.click(screen.getByRole('button', { name: '新建会话' }));
    expect(api.ai.createConversation).not.toHaveBeenCalled();
    fireEvent.change(screen.getByPlaceholderText('你想了解什么？'), { target: { value: '全书讲了什么？' } });
    fireEvent.click(screen.getByRole('button', { name: '发送首次问题' }));
    await waitFor(() => expect(api.ai.createConversation).toHaveBeenCalledOnce());
  });

  it('关闭生成中的 Tab 后仍接收 chunk 和 done', async () => {
    api.threads.listWithMessagesByBook.mockResolvedValueOnce({ threads: [{ thread, messages: [assistant] }], activeThreadId: 't1' });
    localStorage.setItem('whisper.openThreads.b1', JSON.stringify(['t1']));
    render(<ReaderPage bookId="b1" onBack={vi.fn()} />);
    await screen.findByRole('button', { name: '关闭“全书 · 问题”' });
    fireEvent.click(screen.getByRole('button', { name: '关闭“全书 · 问题”' }));
    listeners.forEach((listener) => listener({ type: 'chunk', threadId: 't1', messageId: 'a1', chunk: '后台回答' }));
    listeners.forEach((listener) => listener({ type: 'done', thread: { ...thread, status: 'ready' }, messages: [{ ...assistant, content: '后台回答', status: 'ready' }] }));
    fireEvent.click(screen.getByRole('button', { name: '历史' }));
    await waitFor(() => expect(screen.getByText('全书 · 问题')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '全书 · 问题' }));
    expect(await screen.findByText('后台回答')).toBeTruthy();
  });

  it('打开历史会话不滚动，点击回到原文才滚动', async () => {
    const scroll = vi.fn();
    HTMLElement.prototype.scrollIntoView = scroll;
    api.threads.listWithMessagesByBook.mockResolvedValueOnce({ threads: [{ thread: { ...thread, status: 'ready' }, messages: [{ ...assistant, status: 'ready' }] }], activeThreadId: null });
    render(<ReaderPage bookId="b1" onBack={vi.fn()} />);
    await screen.findByText('所谓自由并不是任性。');
    fireEvent.click(screen.getByRole('button', { name: '历史' }));
    fireEvent.click(screen.getByRole('button', { name: '全书 · 问题' }));
    expect(scroll).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '回到原文' }));
    expect(scroll).toHaveBeenCalledOnce();
  });
});

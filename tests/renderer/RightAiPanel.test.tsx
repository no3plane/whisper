import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { RightAiPanel } from '../../src/renderer/components/RightAiPanel';
import { createBookDraft } from '../../src/renderer/chat/draftState';
import type { MessageReference, ReadingThread, ThreadMessage } from '../../src/shared/types';

afterEach(cleanup);

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

const target = { type: 'book' as const, chapterId: null, startPassageId: null, endPassageId: null, selectedText: '', startOffset: null, endOffset: null, breadcrumb: [] };
const reference: MessageReference = { selectedText: '另一段原文', startPassageId: 'p2', endPassageId: 'p2', startOffset: 0, endOffset: 5, breadcrumb: [{ chapterId: 'c1', title: '第一章' }] };

function thread(status: ReadingThread['status'] = 'ready'): ReadingThread {
  return { id: 't1', bookId: 'b1', title: '全书 · 总结', target, skillType: null, contextStrategy: 'hybrid', createdAt: '2026-07-13T00:00:00Z', updatedAt: '2026-07-13T00:00:00Z', status, lastError: status === 'failed' ? '失败' : null };
}

function message(overrides: Partial<ThreadMessage> = {}): ThreadMessage {
  return { id: 'm1', threadId: 't1', role: 'assistant', content: '回答', createdAt: '2026-07-13T00:00:00Z', model: null, tokenUsage: null, contextStrategy: null, effectiveContextStrategy: null, degradationReason: null, reference: null, status: 'complete', error: null, ...overrides };
}

function renderPanel(overrides: Partial<React.ComponentProps<typeof RightAiPanel>> = {}) {
  const props: React.ComponentProps<typeof RightAiPanel> = {
    threads: [{ thread: thread(), messages: [message()] }],
    historyThreads: [thread()],
    openThreadIds: ['t1'], activeView: { type: 'thread', threadId: 't1' },
    draft: createBookDraft('b1', 'hybrid'), pendingReference: null,
    onOpenDraft: vi.fn(), onUpdateDraft: vi.fn(), onCreate: vi.fn(async () => undefined),
    onSelectThread: vi.fn(), onCloseThread: vi.fn(), onOpenHistory: vi.fn(),
    onOpenThread: vi.fn(), onDeleteThread: vi.fn(), onRetryThread: vi.fn(),
    onFollowUp: vi.fn(async () => undefined), onClearReference: vi.fn(),
    onRetryMessage: vi.fn(), onLocate: vi.fn(), ...overrides,
  };
  const rendered = render(<RightAiPanel {...props} />);
  return Object.assign(props, { container: rendered.container });
}

describe('RightAiPanel', () => {
  it('+ 只打开草稿而不创建会话', () => {
    const props = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: '新建会话' }));
    expect(props.onOpenDraft).toHaveBeenCalledOnce();
    expect(props.onCreate).not.toHaveBeenCalled();
  });

  it('Tab 使用独立横向滚动容器且每项不参与收缩', () => {
    const { container } = renderPanel();
    expect(container.querySelector('.tabs-scroll')).not.toBeNull();
    expect(container.querySelector('.thread-tab')).not.toBeNull();
  });

  it('历史视图渲染全部会话并转发打开 callback', () => {
    const onOpenThread = vi.fn();
    renderPanel({ activeView: { type: 'history' }, onOpenThread });
    const history = screen.getByRole('region', { name: '历史会话' });
    fireEvent.click(within(history).getByRole('button', { name: '全书 · 总结' }));
    expect(onOpenThread).toHaveBeenCalledWith('t1');
  });

  it('历史视图的删除确认转发 delete callback', () => {
    const onDeleteThread = vi.fn();
    renderPanel({ activeView: { type: 'history' }, onDeleteThread });
    fireEvent.click(screen.getByRole('button', { name: '删除“全书 · 总结”' }));
    expect(onDeleteThread).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }));
    expect(onDeleteThread).toHaveBeenCalledWith('t1');
  });

  it('草稿有技能时允许空 prompt 发送', () => {
    const onCreate = vi.fn(async () => undefined);
    renderPanel({ activeView: { type: 'draft' }, draft: { ...createBookDraft('b1', 'hybrid'), skillType: 'book_summary' }, onCreate });
    fireEvent.click(screen.getByRole('button', { name: '发送首次问题' }));
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ skillType: 'book_summary', prompt: '' }));
  });

  it('草稿无技能且 prompt 为空时禁止发送', () => {
    renderPanel({ activeView: { type: 'draft' } });
    expect((screen.getByRole('button', { name: '发送首次问题' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('关闭正式 Tab 只调用 close，streaming 时也可关闭', () => {
    const onCloseThread = vi.fn();
    renderPanel({ threads: [{ thread: thread('streaming'), messages: [message({ status: 'streaming' })] }], onCloseThread });
    fireEvent.click(screen.getByRole('button', { name: '关闭“全书 · 总结”' }));
    expect(onCloseThread).toHaveBeenCalledWith('t1');
  });

  it('引用附件要求输入问题并随追问发送', async () => {
    const onFollowUp = vi.fn(async () => undefined);
    const onClearReference = vi.fn();
    renderPanel({ pendingReference: reference, onFollowUp, onClearReference });
    expect(screen.getByText('另一段原文')).not.toBeNull();
    expect((screen.getByRole('button', { name: '发送追问' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText('结合这段文字追问什么？'), { target: { value: '它与全书有什么关系？' } });
    fireEvent.click(screen.getByRole('button', { name: '发送追问' }));
    await waitFor(() => expect(onFollowUp).toHaveBeenCalledWith('t1', '它与全书有什么关系？', reference));
    expect(onClearReference).toHaveBeenCalledOnce();
  });

  it('失败消息把原 message ID 传给重试 callback', () => {
    const onRetryMessage = vi.fn();
    renderPanel({ threads: [{ thread: thread('failed'), messages: [message({ id: 'failed-message', status: 'failed', error: '超时' })] }], onRetryMessage });
    fireEvent.click(screen.getByRole('button', { name: '重试回答' }));
    expect(onRetryMessage).toHaveBeenCalledWith('t1', 'failed-message');
  });
});

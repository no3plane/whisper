import { readFileSync } from 'node:fs';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { RightAiPanel } from '../../src/renderer/features/conversation/RightAiPanel';
import { createBookDraft } from '../../src/renderer/features/conversation/draftState';
import type { MessageReference, ReadingThread, ThreadMessage } from '../../src/shared/types';
import styles from '../../src/renderer/features/conversation/RightAiPanel.module.css';

const panelCss = readFileSync('src/renderer/features/conversation/RightAiPanel.module.css', 'utf8');

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
const reference: MessageReference = {
  selectedText: '另一段原文',
  startPassageId: 'p2',
  endPassageId: 'p2',
  startOffset: 0,
  endOffset: 5,
  breadcrumb: [{ chapterId: 'c1', title: '第一章' }],
};

function thread(status: ReadingThread['status'] = 'ready'): ReadingThread {
  return {
    id: 't1',
    bookId: 'b1',
    title: '全书 · 总结',
    target,
    skillType: null,
    contextStrategy: 'hybrid',
    createdAt: '2026-07-13T00:00:00Z',
    updatedAt: '2026-07-13T00:00:00Z',
    status,
    lastError: status === 'failed' ? '失败' : null,
  };
}

function message(overrides: Partial<ThreadMessage> = {}): ThreadMessage {
  return {
    id: 'm1',
    threadId: 't1',
    role: 'assistant',
    content: '回答',
    createdAt: '2026-07-13T00:00:00Z',
    model: null,
    tokenUsage: null,
    contextStrategy: null,
    effectiveContextStrategy: null,
    degradationReason: null,
    reference: null,
    status: 'complete',
    error: null,
    ...overrides,
  };
}

interface PanelOptions {
  threads?: Array<{ thread: ReadingThread; messages: ThreadMessage[] }>;
  activeView?: React.ComponentProps<typeof RightAiPanel>['conversation']['workspace']['activeView'];
  draft?: React.ComponentProps<typeof RightAiPanel>['draft']['value'];
  pendingReference?: MessageReference | null;
  onOpenDraft?: ReturnType<typeof vi.fn>;
  onCreate?: ReturnType<typeof vi.fn>;
  onOpenThread?: ReturnType<typeof vi.fn>;
  onDeleteThread?: ReturnType<typeof vi.fn>;
  onFollowUp?: ReturnType<typeof vi.fn>;
  onClearReference?: ReturnType<typeof vi.fn>;
  onCloseThread?: ReturnType<typeof vi.fn>;
  onRetryMessage?: ReturnType<typeof vi.fn>;
}

function renderPanel(options: PanelOptions = {}) {
  const spies = {
    onOpenDraft: options.onOpenDraft ?? vi.fn(),
    onCreate: options.onCreate ?? vi.fn(async () => undefined),
    onOpenThread: options.onOpenThread ?? vi.fn(),
    onDeleteThread: options.onDeleteThread ?? vi.fn(async () => undefined),
    onFollowUp: options.onFollowUp ?? vi.fn(async () => undefined),
    onClearReference: options.onClearReference ?? vi.fn(),
    onCloseThread: options.onCloseThread ?? vi.fn(),
    onRetryMessage: options.onRetryMessage ?? vi.fn(async () => undefined),
  };
  const props: React.ComponentProps<typeof RightAiPanel> = {
    conversation: {
      workspace: {
        threads: options.threads ?? [{ thread: thread(), messages: [message()] }],
        openThreadIds: ['t1'],
        activeView:
          options.activeView === undefined
            ? { type: 'thread', threadId: 't1' }
            : options.activeView,
        pendingReference: options.pendingReference ?? null,
      },
      commands: {
        selectView: vi.fn(),
        selectThread: vi.fn(),
        openThread: spies.onOpenThread,
        closeThread: spies.onCloseThread,
        setReference: spies.onClearReference,
        createConversation: spies.onCreate,
        deleteThread: spies.onDeleteThread,
        followUp: spies.onFollowUp,
        retryMessage: spies.onRetryMessage,
      },
    },
    draft: {
      value: options.draft ?? createBookDraft('b1', 'hybrid'),
      open: spies.onOpenDraft,
      update: vi.fn(),
      selectTarget: vi.fn(),
    },
    onLocate: vi.fn(),
  };
  const rendered = render(<RightAiPanel {...props} />);
  return { ...spies, container: rendered.container };
}

describe('RightAiPanel', () => {
  it('面板为绝对定位的历史层提供 containing block', () => {
    expect(panelCss).toMatch(/\.panel\s*\{[^}]*position:\s*relative;/);
  });

  it('AI 面板以辅助区域呈现并保留现有入口', () => {
    renderPanel();
    expect(screen.getByRole('complementary', { name: '书旁低语' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '新建会话' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '历史' })).toBeTruthy();
  });

  it('+ 只打开草稿而不创建会话', () => {
    const props = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: '新建会话' }));
    expect(props.onOpenDraft).toHaveBeenCalledOnce();
    expect(props.onCreate).not.toHaveBeenCalled();
  });

  it('Tab 使用独立横向滚动容器且每项不参与收缩', () => {
    const { container } = renderPanel();
    expect(container.querySelector(`.${styles.tabsScroll}`)).not.toBeNull();
    expect(container.querySelector(`.${styles.threadTab}`)).not.toBeNull();
  });

  it('历史视图渲染全部会话并转发打开 callback', () => {
    const onOpenThread = vi.fn();
    renderPanel({ activeView: { type: 'history' }, onOpenThread });
    const history = screen.getByRole('region', { name: '历史会话' });
    fireEvent.click(within(history).getByRole('button', { name: '全书 · 总结' }));
    expect(onOpenThread).toHaveBeenCalledWith('t1');
  });

  it('历史视图取消删除后仍可确认并转发 delete callback', () => {
    const onDeleteThread = vi.fn();
    renderPanel({ activeView: { type: 'history' }, onDeleteThread });
    fireEvent.click(screen.getByRole('button', { name: '删除“全书 · 总结”' }));
    expect(onDeleteThread).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(screen.queryByRole('dialog', { name: '确认删除会话' })).toBeNull();
    expect(onDeleteThread).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '删除“全书 · 总结”' }));
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }));
    expect(onDeleteThread).toHaveBeenCalledWith('t1');
  });

  it('草稿有技能时允许空 prompt 发送', () => {
    const onCreate = vi.fn(async () => undefined);
    renderPanel({
      activeView: { type: 'draft' },
      draft: { ...createBookDraft('b1', 'hybrid'), skillType: 'book_summary' },
      onCreate,
    });
    fireEvent.click(screen.getByRole('button', { name: '发送首次问题' }));
    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({ skillType: 'book_summary', prompt: '' }),
    );
  });

  it('草稿无技能且 prompt 为空时禁止发送', () => {
    renderPanel({ activeView: { type: 'draft' } });
    expect(
      (screen.getByRole('button', { name: '发送首次问题' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('关闭正式 Tab 只调用 close，streaming 时也可关闭', () => {
    const onCloseThread = vi.fn();
    renderPanel({
      threads: [{ thread: thread('streaming'), messages: [message({ status: 'streaming' })] }],
      onCloseThread,
    });
    fireEvent.click(screen.getByRole('button', { name: '关闭“全书 · 总结”' }));
    expect(onCloseThread).toHaveBeenCalledWith('t1');
  });

  it('引用附件要求输入问题并随追问发送', async () => {
    const onFollowUp = vi.fn(async () => undefined);
    const onClearReference = vi.fn();
    renderPanel({ pendingReference: reference, onFollowUp, onClearReference });
    expect(screen.getByText('另一段原文')).not.toBeNull();
    expect((screen.getByRole('button', { name: '发送追问' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    fireEvent.change(screen.getByPlaceholderText('结合这段文字追问什么？'), {
      target: { value: '它与全书有什么关系？' },
    });
    fireEvent.click(screen.getByRole('button', { name: '发送追问' }));
    await waitFor(() =>
      expect(onFollowUp).toHaveBeenCalledWith('t1', '它与全书有什么关系？', reference),
    );
    expect(onClearReference).toHaveBeenCalledOnce();
  });

  it('Enter 发送追问，Shift+Enter 保留换行', async () => {
    const onFollowUp = vi.fn(async () => undefined);
    renderPanel({ onFollowUp });
    const input = screen.getByPlaceholderText('继续追问这个回答');
    fireEvent.change(input, { target: { value: '第一行' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', shiftKey: true });
    expect(onFollowUp).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: '第一行\n第二行' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    await waitFor(() => expect(onFollowUp).toHaveBeenCalledWith('t1', '第一行\n第二行', null));
  });

  it('追问发送失败时保留输入和引用', async () => {
    const onFollowUp = vi.fn(async () => {
      throw new Error('网络错误');
    });
    const onClearReference = vi.fn();
    renderPanel({ pendingReference: reference, onFollowUp, onClearReference });
    const input = screen.getByPlaceholderText('结合这段文字追问什么？');
    fireEvent.change(input, { target: { value: '请重试' } });
    fireEvent.click(screen.getByRole('button', { name: '发送追问' }));
    await waitFor(() => expect(onFollowUp).toHaveBeenCalledOnce());
    expect((input as HTMLTextAreaElement).value).toBe('请重试');
    expect(screen.getByText('另一段原文')).not.toBeNull();
    expect(onClearReference).not.toHaveBeenCalled();
  });

  it('失败消息把原 message ID 传给重试 callback', () => {
    const onRetryMessage = vi.fn();
    renderPanel({
      threads: [
        {
          thread: thread('failed'),
          messages: [message({ id: 'failed-message', status: 'failed', error: '超时' })],
        },
      ],
      onRetryMessage,
    });
    fireEvent.click(screen.getByRole('button', { name: '重试回答' }));
    expect(onRetryMessage).toHaveBeenCalledWith('t1', 'failed-message');
  });
});

import { describe, expect, it } from 'vitest';
import {
  conversationWorkspaceReducer,
  createConversationWorkspace,
} from '../../src/renderer/features/conversation/conversationWorkspace';
import type { ReadingThread, ThreadMessage } from '../../src/shared/types';

const target = {
  type: 'book' as const,
  chapterId: null,
  start: null,
  end: null,
  selectedText: '',
  breadcrumb: [],
};
const thread = (id: string): ReadingThread => ({
  id,
  bookId: 'b1',
  title: id,
  target,
  skillType: null,
  contextStrategy: 'hybrid',
  createdAt: '',
  updatedAt: '',
  status: 'ready',
  lastError: null,
});
const message = (threadId: string): ThreadMessage => ({
  id: `message-${threadId}`,
  threadId,
  role: 'assistant',
  content: '',
  createdAt: '',
  model: null,
  tokenUsage: null,
  contextStrategy: null,
  effectiveContextStrategy: null,
  degradationReason: null,
  reference: null,
  status: 'complete',
  error: null,
});

describe('conversationWorkspaceReducer', () => {
  it('初始化时只保留存在的 Tab 和活动会话', () => {
    const state = conversationWorkspaceReducer(createConversationWorkspace(), {
      type: 'initialized',
      threads: [
        { thread: thread('t1'), messages: [] },
        { thread: thread('t2'), messages: [] },
      ],
      savedOpenThreadIds: ['missing', 't2'],
      activeThreadId: 't1',
    });

    expect(state.openThreadIds).toEqual(['t2']);
    expect(state.activeView).toEqual({ type: 'thread', threadId: 't2' });
  });

  it('关闭活动 Tab 时选择相邻 Tab 并清除引用', () => {
    const initialized = conversationWorkspaceReducer(createConversationWorkspace(), {
      type: 'initialized',
      threads: [
        { thread: thread('t1'), messages: [message('t1')] },
        { thread: thread('t2'), messages: [] },
      ],
      savedOpenThreadIds: ['t1', 't2'],
      activeThreadId: 't1',
    });
    const withReference = {
      ...initialized,
      pendingReference: {
        selectedText: '引用',
        start: { blockId: 'p1', offset: 0 },
        end: { blockId: 'p1', offset: 2 },
        breadcrumb: [],
      },
    };

    const state = conversationWorkspaceReducer(withReference, {
      type: 'threadClosed',
      threadId: 't1',
    });

    expect(state.openThreadIds).toEqual(['t2']);
    expect(state.activeView).toEqual({ type: 'thread', threadId: 't2' });
    expect(state.pendingReference).toBeNull();
  });
});

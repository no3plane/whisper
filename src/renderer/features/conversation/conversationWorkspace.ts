import type { AiStreamEvent, ReadingThread, ThreadMessage } from '../../../shared/types';

export type AiPanelView =
  | { type: 'draft' }
  | { type: 'thread'; threadId: string }
  | { type: 'history' }
  | null;

export interface ThreadItem {
  thread: ReadingThread;
  messages: ThreadMessage[];
}

export interface ConversationWorkspace {
  threads: ThreadItem[];
  openThreadIds: string[];
  activeView: AiPanelView;
}

export type ConversationWorkspaceAction =
  | {
      type: 'initialized';
      threads: ThreadItem[];
      savedOpenThreadIds: string[] | null;
      activeThreadId: string | null;
    }
  | { type: 'viewChanged'; activeView: AiPanelView }
  | { type: 'threadOpened'; threadId: string }
  | { type: 'threadClosed'; threadId: string }
  | { type: 'threadRemoved'; threadId: string }
  | { type: 'threadUpserted'; thread: ReadingThread; messages: ThreadMessage[] }
  | { type: 'streamReceived'; event: AiStreamEvent };

export function createConversationWorkspace(): ConversationWorkspace {
  return { threads: [], openThreadIds: [], activeView: null };
}

export function conversationWorkspaceReducer(
  state: ConversationWorkspace,
  action: ConversationWorkspaceAction,
): ConversationWorkspace {
  switch (action.type) {
    case 'initialized': {
      const known = new Set(action.threads.map((item) => item.thread.id));
      const defaultThreadId =
        action.activeThreadId && known.has(action.activeThreadId)
          ? action.activeThreadId
          : action.threads[0]?.thread.id;
      const defaults = defaultThreadId ? [defaultThreadId] : [];
      const openThreadIds = (action.savedOpenThreadIds ?? defaults).filter((id) => known.has(id));
      const activeThreadId =
        action.activeThreadId && openThreadIds.includes(action.activeThreadId)
          ? action.activeThreadId
          : openThreadIds[0];
      return {
        threads: action.threads,
        openThreadIds,
        activeView: activeThreadId ? { type: 'thread', threadId: activeThreadId } : null,
      };
    }
    case 'viewChanged':
      return { ...state, activeView: action.activeView };
    case 'threadOpened':
      return {
        ...state,
        openThreadIds: state.openThreadIds.includes(action.threadId)
          ? state.openThreadIds
          : [...state.openThreadIds, action.threadId],
        activeView: { type: 'thread', threadId: action.threadId },
      };
    case 'threadClosed': {
      const index = state.openThreadIds.indexOf(action.threadId);
      const openThreadIds = state.openThreadIds.filter((id) => id !== action.threadId);
      const closesActive =
        state.activeView?.type === 'thread' && state.activeView.threadId === action.threadId;
      const neighbor = closesActive
        ? openThreadIds[Math.min(index, openThreadIds.length - 1)]
        : null;
      return {
        ...state,
        openThreadIds,
        activeView: closesActive
          ? neighbor
            ? { type: 'thread', threadId: neighbor }
            : null
          : state.activeView,
      };
    }
    case 'threadRemoved':
      return conversationWorkspaceReducer(
        { ...state, threads: state.threads.filter((item) => item.thread.id !== action.threadId) },
        { type: 'threadClosed', threadId: action.threadId },
      );
    case 'threadUpserted': {
      const next = { thread: action.thread, messages: action.messages };
      const threads = state.threads.some((item) => item.thread.id === action.thread.id)
        ? state.threads.map((item) => (item.thread.id === action.thread.id ? next : item))
        : [...state.threads, next];
      return { ...state, threads };
    }
    case 'streamReceived':
      return { ...state, threads: updateThreadsFromStream(state.threads, action.event) };
  }
}

function updateThreadsFromStream(items: ThreadItem[], event: AiStreamEvent): ThreadItem[] {
  if (event.type === 'started' || event.type === 'done') {
    const next = { thread: event.thread, messages: event.messages };
    return items.some((item) => item.thread.id === event.thread.id)
      ? items.map((item) => (item.thread.id === event.thread.id ? next : item))
      : [...items, next];
  }
  return items.map((item) =>
    item.thread.id !== event.threadId
      ? item
      : event.type === 'chunk'
        ? {
            ...item,
            thread: { ...item.thread, status: 'streaming' },
            messages: item.messages.map((message) =>
              message.id === event.messageId
                ? { ...message, content: message.content + event.chunk, status: 'streaming' }
                : message,
            ),
          }
        : {
            ...item,
            thread: { ...item.thread, status: 'failed', lastError: event.message },
            messages: item.messages.map((message) =>
              message.id === event.messageId
                ? { ...message, status: 'failed', error: event.message }
                : message,
            ),
          },
  );
}

import { useCallback, useEffect, useReducer, useRef } from 'react';
import type { CreateConversationInput } from '../../../shared/types';
import { whisper } from '../../api/whisper';
import {
  conversationWorkspaceReducer,
  createConversationWorkspace,
  type AiPanelView,
} from './conversationWorkspace';

export interface ConversationCommands {
  selectView(activeView: AiPanelView): void;
  selectThread(threadId: string): void;
  openThread(threadId: string): void;
  closeThread(threadId: string): void;
  createConversation(input: CreateConversationInput): Promise<void>;
  deleteThread(threadId: string): Promise<void>;
  followUp(threadId: string, question: string): Promise<void>;
  retryMessage(threadId: string, messageId: string): Promise<void>;
}

export interface ConversationController {
  workspace: ReturnType<typeof createConversationWorkspace>;
  commands: ConversationCommands;
}

export function useConversationWorkspace(bookId: string, onError: (message: string) => void) {
  const [state, dispatch] = useReducer(
    conversationWorkspaceReducer,
    undefined,
    createConversationWorkspace,
  );
  const stateRef = useRef(state);
  const initialized = useRef(false);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    let cancelled = false;
    initialized.current = false;
    void whisper.threads
      .listWithMessagesByBook(bookId)
      .then((history) => {
        if (cancelled) {
          return;
        }
        dispatch({
          type: 'initialized',
          threads: history.threads,
          savedOpenThreadIds: readOpenThreads(bookId),
          activeThreadId: history.activeThreadId,
        });
        initialized.current = true;
      })
      .catch((reason) => {
        if (!cancelled) {
          onError(messageOf(reason));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [bookId, onError]);

  useEffect(() => {
    if (initialized.current) {
      localStorage.setItem(openThreadsKey(bookId), JSON.stringify(state.openThreadIds));
    }
  }, [bookId, state.openThreadIds]);

  useEffect(
    () =>
      whisper.ai.onStream((event) => {
        const current = stateRef.current;
        if ((event.type === 'started' || event.type === 'done') && event.thread.bookId !== bookId) {
          return;
        }
        if (
          (event.type === 'chunk' || event.type === 'error') &&
          !current.threads.some((item) => item.thread.id === event.threadId)
        ) {
          return;
        }
        const isNew =
          event.type === 'started' &&
          !current.threads.some((item) => item.thread.id === event.thread.id);
        dispatch({ type: 'streamReceived', event });
        if (!isNew) {
          return;
        }
        dispatch({ type: 'threadOpened', threadId: event.thread.id });
        void whisper.books
          .setActiveThread({ bookId: event.thread.bookId, threadId: event.thread.id })
          .catch(() => undefined);
      }),
    [bookId],
  );

  const selectView = useCallback((activeView: AiPanelView) => {
    dispatch({ type: 'viewChanged', activeView });
  }, []);

  const selectThread = useCallback(
    (threadId: string) => {
      selectView({ type: 'thread', threadId });
      void whisper.books.setActiveThread({ bookId, threadId }).catch(() => undefined);
    },
    [bookId, selectView],
  );

  const openThread = useCallback(
    (threadId: string) => {
      dispatch({ type: 'threadOpened', threadId });
      void whisper.books.setActiveThread({ bookId, threadId }).catch(() => undefined);
    },
    [bookId],
  );

  const closeThread = useCallback(
    (threadId: string) => {
      const current = stateRef.current;
      const index = current.openThreadIds.indexOf(threadId);
      const next = current.openThreadIds.filter((id) => id !== threadId);
      const neighbor = next[Math.min(index, next.length - 1)];
      dispatch({ type: 'threadClosed', threadId });
      if (
        current.activeView?.type === 'thread' &&
        current.activeView.threadId === threadId &&
        neighbor
      ) {
        void whisper.books.setActiveThread({ bookId, threadId: neighbor }).catch(() => undefined);
      }
    },
    [bookId],
  );

  async function run(command: () => Promise<void>, rethrow = false) {
    try {
      await command();
    } catch (reason) {
      onError(messageOf(reason));
      if (rethrow) {
        throw reason;
      }
    }
  }

  const commands: ConversationCommands = {
    selectView,
    selectThread,
    openThread,
    closeThread,
    createConversation: (input: CreateConversationInput) =>
      run(async () => {
        const result = await whisper.ai.createConversation(input);
        dispatch({ type: 'threadUpserted', thread: result.thread, messages: result.messages });
        openThread(result.thread.id);
      }),
    deleteThread: (threadId: string) =>
      run(async () => {
        await whisper.threads.delete({ threadId });
        dispatch({ type: 'threadRemoved', threadId });
      }),
    followUp: (threadId: string, question: string) =>
      run(async () => {
        const result = await whisper.ai.followUp({ threadId, question, reference: null });
        dispatch({ type: 'threadUpserted', thread: result.thread, messages: result.messages });
      }, true),
    retryMessage: (threadId: string, messageId: string) =>
      run(async () => {
        const result = await whisper.ai.retry({ threadId, messageId });
        dispatch({ type: 'threadUpserted', thread: result.thread, messages: result.messages });
      }),
  };
  return { workspace: state, commands };
}

function openThreadsKey(bookId: string) {
  return `whisper.openThreads.${bookId}`;
}

function readOpenThreads(bookId: string): string[] | null {
  try {
    const raw = localStorage.getItem(openThreadsKey(bookId));
    if (raw === null) {
      return null;
    }
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function messageOf(reason: unknown) {
  return reason instanceof Error ? reason.message : String(reason);
}

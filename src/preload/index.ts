import { contextBridge, ipcRenderer } from 'electron';
import { ipcChannels } from '../shared/ipc';
import type {
  AISettings,
  AiStreamEvent,
  Book,
  BookDocument,
  BookThreadsPayload,
  CreateConversationInput,
  DeleteThreadInput,
  FollowUpInput,
  ImportBookInput,
  ReadingThread,
  RetryMessageInput,
  SetActiveThreadInput,
  ThreadMessage,
  ContextStrategy,
} from '../shared/types';

const whisper = {
  settings: {
    get: () => ipcRenderer.invoke(ipcChannels.settingsGet) as Promise<AISettings | null>,
    save: (settings: AISettings) => ipcRenderer.invoke(ipcChannels.settingsSave, settings) as Promise<void>,
    testConnection: (settings: AISettings) =>
      ipcRenderer.invoke(ipcChannels.settingsTestConnection, settings) as Promise<{ ok: boolean; message: string }>,
  },
  books: {
    importMarkdown: (input: ImportBookInput) =>
      ipcRenderer.invoke(ipcChannels.booksImportMarkdown, input) as Promise<Book>,
    importEpub: (input: ImportBookInput) => ipcRenderer.invoke(ipcChannels.booksImportEpub, input) as Promise<Book>,
    list: () => ipcRenderer.invoke(ipcChannels.booksList) as Promise<Book[]>,
    open: (bookId: string) => ipcRenderer.invoke(ipcChannels.booksOpen, bookId) as Promise<BookDocument>,
    setActiveThread: (input: SetActiveThreadInput) =>
      ipcRenderer.invoke(ipcChannels.booksSetActiveThread, input) as Promise<void>,
    setContextStrategy: (input: { bookId: string; strategy: ContextStrategy }) =>
      ipcRenderer.invoke(ipcChannels.booksSetContextStrategy, input) as Promise<void>,
  },
  ai: {
    createConversation: (input: CreateConversationInput) =>
      ipcRenderer.invoke(ipcChannels.aiCreateConversation, input) as Promise<{
        thread: ReadingThread;
        messages: ThreadMessage[];
      }>,
    followUp: (input: FollowUpInput) =>
      ipcRenderer.invoke(ipcChannels.aiFollowUp, input) as Promise<{ thread: ReadingThread; messages: ThreadMessage[] }>,
    retry: (input: RetryMessageInput) =>
      ipcRenderer.invoke(ipcChannels.aiRetry, input) as Promise<{ thread: ReadingThread; messages: ThreadMessage[] }>,
    onStream: (listener: (event: AiStreamEvent) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: AiStreamEvent) => listener(payload);
      ipcRenderer.on(ipcChannels.aiStream, handler);
      return () => {
        ipcRenderer.removeListener(ipcChannels.aiStream, handler);
      };
    },
  },
  threads: {
    delete: (input: DeleteThreadInput) => ipcRenderer.invoke(ipcChannels.threadsDelete, input) as Promise<void>,
    listByBook: (bookId: string) =>
      ipcRenderer.invoke(ipcChannels.threadsListByBook, bookId) as Promise<ReadingThread[]>,
    listWithMessagesByBook: (bookId: string) =>
      ipcRenderer.invoke(ipcChannels.threadsListWithMessagesByBook, bookId) as Promise<BookThreadsPayload>,
  },
};

contextBridge.exposeInMainWorld('whisper', whisper);

export type WhisperApi = typeof whisper;

import { contextBridge, ipcRenderer } from 'electron';
import { ipcChannels } from '../shared/ipc';
import type {
  AISettings,
  AiStreamEvent,
  Book,
  BookDocument,
  FollowUpInput,
  ImportBookInput,
  ReadingThread,
  RunReadingActionInput,
  ThreadMessage,
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
    list: () => ipcRenderer.invoke(ipcChannels.booksList) as Promise<Book[]>,
    open: (bookId: string) => ipcRenderer.invoke(ipcChannels.booksOpen, bookId) as Promise<BookDocument>,
  },
  ai: {
    runReadingAction: (input: RunReadingActionInput) =>
      ipcRenderer.invoke(ipcChannels.aiRunReadingAction, input) as Promise<{
        thread: ReadingThread;
        messages: ThreadMessage[];
      }>,
    followUp: (input: FollowUpInput) =>
      ipcRenderer.invoke(ipcChannels.aiFollowUp, input) as Promise<{ thread: ReadingThread; messages: ThreadMessage[] }>,
    onStream: (listener: (event: AiStreamEvent) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: AiStreamEvent) => listener(payload);
      ipcRenderer.on(ipcChannels.aiStream, handler);
      return () => {
        ipcRenderer.removeListener(ipcChannels.aiStream, handler);
      };
    },
  },
  threads: {
    listByBook: (bookId: string) =>
      ipcRenderer.invoke(ipcChannels.threadsListByBook, bookId) as Promise<ReadingThread[]>,
  },
};

contextBridge.exposeInMainWorld('whisper', whisper);

export type WhisperApi = typeof whisper;

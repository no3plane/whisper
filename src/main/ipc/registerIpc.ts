import { BrowserWindow, ipcMain } from 'electron';
import { ipcChannels } from '../../shared/ipc';
import type { AISettings, ContextStrategy, CreateConversationInput, DeleteThreadInput, FollowUpInput, ImportBookInput, RetryMessageInput, SetActiveThreadInput } from '../../shared/types';
import { AIProvider } from '../ai/AIProvider';
import type { ReadingActionService } from '../ai/ReadingActionService';
import type { LibraryService } from '../library/LibraryService';
import { logger } from '../logging/logger';
import type { SettingsService } from '../settings/SettingsService';
import type { ThreadStore } from '../threads/ThreadStore';

export interface IpcServices {
  settings: SettingsService;
  library: LibraryService;
  readingActions: ReadingActionService;
  threads: ThreadStore;
}

const aiProvider = new AIProvider();

function senderWindow(event: Electron.IpcMainInvokeEvent) {
  return BrowserWindow.fromWebContents(event.sender);
}

function withIpcLog<Args extends unknown[], Result>(
  channel: string,
  handler: (event: Electron.IpcMainInvokeEvent, ...args: Args) => Result | Promise<Result>,
) {
  return async (event: Electron.IpcMainInvokeEvent, ...args: Args) => {
    try {
      return await handler(event, ...args);
    } catch (error) {
      logger.error('ipc.error', {
        channel,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  };
}

export function registerIpc(services: IpcServices) {
  ipcMain.handle(
    ipcChannels.settingsGet,
    withIpcLog(ipcChannels.settingsGet, () => services.settings.getAISettings()),
  );

  ipcMain.handle(
    ipcChannels.settingsSave,
    withIpcLog(ipcChannels.settingsSave, (_event, settings: AISettings) => {
      services.settings.saveAISettings(settings);
    }),
  );

  ipcMain.handle(
    ipcChannels.settingsTestConnection,
    withIpcLog(ipcChannels.settingsTestConnection, (_event, settings: AISettings) =>
      aiProvider.testConnection(settings),
    ),
  );

  ipcMain.handle(
    ipcChannels.booksImportMarkdown,
    withIpcLog(ipcChannels.booksImportMarkdown, (_event, input: ImportBookInput | string) => {
      const filePath = typeof input === 'string' ? input : input.filePath;
      const book = services.library.importMarkdown(filePath);
      return book;
    }),
  );

  ipcMain.handle(
    ipcChannels.booksImportEpub,
    withIpcLog(ipcChannels.booksImportEpub, (_event, input: ImportBookInput | string) => {
      const book = services.library.importEpub(typeof input === 'string' ? input : input.filePath);
      return book;
    }),
  );

  ipcMain.handle(
    ipcChannels.booksList,
    withIpcLog(ipcChannels.booksList, () => services.library.listBooks()),
  );

  ipcMain.handle(
    ipcChannels.booksOpen,
    withIpcLog(ipcChannels.booksOpen, (_event, bookId: string) => services.library.openBook(bookId)),
  );

  ipcMain.handle(
    ipcChannels.booksSetContextStrategy,
    withIpcLog(ipcChannels.booksSetContextStrategy, (_event, input: { bookId: string; strategy: ContextStrategy }) =>
      services.library.setDefaultContextStrategy(input.bookId, input.strategy)),
  );

  ipcMain.handle(
    ipcChannels.aiCreateConversation,
    withIpcLog(ipcChannels.aiCreateConversation, (event, input: CreateConversationInput) => {
      const window = senderWindow(event);
      if (!window) throw new Error('找不到当前窗口，无法启动流式回答。');
      return services.readingActions.createConversation(input, window);
    }),
  );

  ipcMain.handle(
    ipcChannels.aiRetry,
    withIpcLog(ipcChannels.aiRetry, (event, input: RetryMessageInput) => {
      const window = senderWindow(event);
      if (!window) throw new Error('找不到当前窗口，无法重试回答。');
      return services.readingActions.retry(input, window);
    }),
  );

  ipcMain.handle(
    ipcChannels.aiFollowUp,
    withIpcLog(ipcChannels.aiFollowUp, (event, input: FollowUpInput) => {
      const window = senderWindow(event);
      if (!window) throw new Error('找不到当前窗口，无法启动流式回答。');
      return services.readingActions.followUp(input, window);
    }),
  );

  ipcMain.handle(
    ipcChannels.threadsDelete,
    withIpcLog(ipcChannels.threadsDelete, (_event, input: DeleteThreadInput) =>
      services.readingActions.deleteConversation(input)),
  );

  ipcMain.handle(
    ipcChannels.threadsListByBook,
    withIpcLog(ipcChannels.threadsListByBook, (_event, bookId: string) =>
      services.threads.listThreadsByBook(bookId),
    ),
  );

  ipcMain.handle(
    ipcChannels.threadsListWithMessagesByBook,
    withIpcLog(ipcChannels.threadsListWithMessagesByBook, (_event, bookId: string) =>
      services.threads.listThreadsWithMessagesByBook(bookId),
    ),
  );

  ipcMain.handle(
    ipcChannels.booksSetActiveThread,
    withIpcLog(ipcChannels.booksSetActiveThread, (_event, input: SetActiveThreadInput) => {
      services.library.setActiveThread(input.bookId, input.threadId);
    }),
  );
}

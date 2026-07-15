import { BrowserWindow, ipcMain } from 'electron';
import { ipcChannels } from '../../shared/ipc';
import { ipcInputSchemas, parseIpcInput } from '../../shared/ipcSchemas';
import type {
  AISettings,
  ContextStrategy,
  CreateConversationInput,
  DeleteThreadInput,
  FollowUpInput,
  ImportBookInput,
  RetryMessageInput,
  SetActiveThreadInput,
} from '../../shared/types';
import { AIProvider } from '../ai/AIProvider';
import type { ReadingActionService } from '../ai/ReadingActionService';
import type { LibraryService } from '../library/LibraryService';
import { logger } from '../logging/logger';
import type { SettingsService } from '../settings/SettingsService';
import type { ThreadStore } from '../threads/ThreadStore';
import { importBookFiles } from './importBookFiles';

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

function validated<T, Result>(
  channel: string,
  schema: Parameters<typeof parseIpcInput<T>>[1],
  handler: (event: Electron.IpcMainInvokeEvent, input: T) => Result | Promise<Result>,
) {
  return withIpcLog(channel, (event, input: unknown) =>
    handler(event, parseIpcInput(channel, schema, input)),
  );
}

export function registerIpc(services: IpcServices) {
  ipcMain.handle(
    ipcChannels.settingsGet,
    withIpcLog(ipcChannels.settingsGet, () => services.settings.getAISettings()),
  );

  ipcMain.handle(
    ipcChannels.settingsSave,
    validated(
      ipcChannels.settingsSave,
      ipcInputSchemas.aiSettings,
      (_event, settings: AISettings) => {
        services.settings.saveAISettings(settings);
      },
    ),
  );

  ipcMain.handle(
    ipcChannels.settingsTestConnection,
    validated(
      ipcChannels.settingsTestConnection,
      ipcInputSchemas.aiSettings,
      (_event, settings: AISettings) => aiProvider.testConnection(settings),
    ),
  );

  ipcMain.handle(
    ipcChannels.booksImportFiles,
    validated(
      ipcChannels.booksImportFiles,
      ipcInputSchemas.importBookFiles,
      (_event, filePaths: string[]) => importBookFiles(filePaths, services.library),
    ),
  );

  ipcMain.handle(
    ipcChannels.booksImportMarkdown,
    validated(
      ipcChannels.booksImportMarkdown,
      ipcInputSchemas.importBook,
      (_event, input: ImportBookInput | string) => {
        const filePath = typeof input === 'string' ? input : input.filePath;
        const book = services.library.importMarkdown(filePath);
        return book;
      },
    ),
  );

  ipcMain.handle(
    ipcChannels.booksImportEpub,
    validated(
      ipcChannels.booksImportEpub,
      ipcInputSchemas.importBook,
      (_event, input: ImportBookInput | string) => {
        const book = services.library.importEpub(
          typeof input === 'string' ? input : input.filePath,
        );
        return book;
      },
    ),
  );

  ipcMain.handle(
    ipcChannels.booksList,
    withIpcLog(ipcChannels.booksList, () => services.library.listBooks()),
  );

  ipcMain.handle(
    ipcChannels.booksOpen,
    validated(ipcChannels.booksOpen, ipcInputSchemas.bookId, (_event, bookId: string) =>
      services.library.openBook(bookId),
    ),
  );

  ipcMain.handle(
    ipcChannels.booksSetContextStrategy,
    validated(
      ipcChannels.booksSetContextStrategy,
      ipcInputSchemas.setContextStrategy,
      (_event, input: { bookId: string; strategy: ContextStrategy }) =>
        services.library.setDefaultContextStrategy(input.bookId, input.strategy),
    ),
  );

  ipcMain.handle(
    ipcChannels.aiCreateConversation,
    validated(
      ipcChannels.aiCreateConversation,
      ipcInputSchemas.createConversation,
      (event, input: CreateConversationInput) => {
        const window = senderWindow(event);
        if (!window) {
          throw new Error('找不到当前窗口，无法启动流式回答。');
        }
        return services.readingActions.createConversation(input, window);
      },
    ),
  );

  ipcMain.handle(
    ipcChannels.aiRetry,
    validated(ipcChannels.aiRetry, ipcInputSchemas.retry, (event, input: RetryMessageInput) => {
      const window = senderWindow(event);
      if (!window) {
        throw new Error('找不到当前窗口，无法重试回答。');
      }
      return services.readingActions.retry(input, window);
    }),
  );

  ipcMain.handle(
    ipcChannels.aiFollowUp,
    validated(ipcChannels.aiFollowUp, ipcInputSchemas.followUp, (event, input: FollowUpInput) => {
      const window = senderWindow(event);
      if (!window) {
        throw new Error('找不到当前窗口，无法启动流式回答。');
      }
      return services.readingActions.followUp(input, window);
    }),
  );

  ipcMain.handle(
    ipcChannels.threadsDelete,
    validated(
      ipcChannels.threadsDelete,
      ipcInputSchemas.deleteThread,
      (_event, input: DeleteThreadInput) => services.readingActions.deleteConversation(input),
    ),
  );

  ipcMain.handle(
    ipcChannels.threadsListByBook,
    validated(ipcChannels.threadsListByBook, ipcInputSchemas.bookId, (_event, bookId: string) =>
      services.threads.listThreadsByBook(bookId),
    ),
  );

  ipcMain.handle(
    ipcChannels.threadsListWithMessagesByBook,
    validated(
      ipcChannels.threadsListWithMessagesByBook,
      ipcInputSchemas.bookId,
      (_event, bookId: string) => services.threads.listThreadsWithMessagesByBook(bookId),
    ),
  );

  ipcMain.handle(
    ipcChannels.booksSetActiveThread,
    validated(
      ipcChannels.booksSetActiveThread,
      ipcInputSchemas.setActiveThread,
      (_event, input: SetActiveThreadInput) => {
        services.library.setActiveThread(input.bookId, input.threadId);
      },
    ),
  );
}

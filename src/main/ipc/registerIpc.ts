import { BrowserWindow, ipcMain } from 'electron';
import { ipcChannels } from '../../shared/ipc';
import type { AISettings, FollowUpInput, ImportBookInput, RunReadingActionInput, SetActiveThreadInput } from '../../shared/types';
import { AIProvider } from '../ai/AIProvider';
import type { ReadingActionService } from '../ai/ReadingActionService';
import type { LibraryService } from '../library/LibraryService';
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

export function registerIpc(services: IpcServices) {
  ipcMain.handle(ipcChannels.settingsGet, () => services.settings.getAISettings());

  ipcMain.handle(ipcChannels.settingsSave, (_event, settings: AISettings) => {
    services.settings.saveAISettings(settings);
  });

  ipcMain.handle(ipcChannels.settingsTestConnection, (_event, settings: AISettings) =>
    aiProvider.testConnection(settings),
  );

  ipcMain.handle(ipcChannels.booksImportMarkdown, (_event, input: ImportBookInput | string) => {
    const filePath = typeof input === 'string' ? input : input.filePath;
    return services.library.importMarkdown(filePath);
  });

  ipcMain.handle(ipcChannels.booksList, () => services.library.listBooks());

  ipcMain.handle(ipcChannels.booksOpen, (_event, bookId: string) => services.library.openBook(bookId));

  ipcMain.handle(ipcChannels.aiRunReadingAction, (event, input: RunReadingActionInput) => {
    const window = senderWindow(event);
    if (!window) throw new Error('找不到当前窗口，无法启动流式回答。');
    return services.readingActions.runReadingAction(input, window);
  });

  ipcMain.handle(ipcChannels.aiFollowUp, (event, input: FollowUpInput) => {
    const window = senderWindow(event);
    if (!window) throw new Error('找不到当前窗口，无法启动流式回答。');
    return services.readingActions.followUp(input, window);
  });

  ipcMain.handle(ipcChannels.threadsListByBook, (_event, bookId: string) => services.threads.listThreadsByBook(bookId));

  ipcMain.handle(ipcChannels.threadsListWithMessagesByBook, (_event, bookId: string) =>
    services.threads.listThreadsWithMessagesByBook(bookId),
  );

  ipcMain.handle(ipcChannels.booksSetActiveThread, (_event, input: SetActiveThreadInput) => {
    services.library.setActiveThread(input.bookId, input.threadId);
  });
}

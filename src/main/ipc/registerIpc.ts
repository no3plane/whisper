import { ipcMain } from 'electron';
import { ipcChannels } from '../../shared/ipc';
import type { AISettings, FollowUpInput, ImportBookInput, RunReadingActionInput } from '../../shared/types';
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

  ipcMain.handle(ipcChannels.aiRunReadingAction, (_event, input: RunReadingActionInput) =>
    services.readingActions.runReadingAction(input),
  );

  ipcMain.handle(ipcChannels.aiFollowUp, (_event, input: FollowUpInput) => services.readingActions.followUp(input));

  ipcMain.handle(ipcChannels.threadsListByBook, (_event, bookId: string) => services.threads.listThreadsByBook(bookId));
}

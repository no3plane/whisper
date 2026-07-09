import { ipcMain } from 'electron';
import { ipcChannels } from '../../shared/ipc';
import type { AISettings, ImportBookInput } from '../../shared/types';
import type { LibraryService } from '../library/LibraryService';
import type { SettingsService } from '../settings/SettingsService';

export interface IpcServices {
  settings: SettingsService;
  library: LibraryService;
}

export function registerIpc(services: IpcServices) {
  ipcMain.handle(ipcChannels.settingsGet, () => services.settings.getAISettings());

  ipcMain.handle(ipcChannels.settingsSave, (_event, settings: AISettings) => {
    services.settings.saveAISettings(settings);
  });

  ipcMain.handle(ipcChannels.settingsTestConnection, () => ({
    ok: true,
    message: '设置 API 已连通；模型连接将在 AIProvider 任务中实现。',
  }));

  ipcMain.handle(ipcChannels.booksImportMarkdown, (_event, input: ImportBookInput | string) => {
    const filePath = typeof input === 'string' ? input : input.filePath;
    return services.library.importMarkdown(filePath);
  });

  ipcMain.handle(ipcChannels.booksList, () => services.library.listBooks());

  ipcMain.handle(ipcChannels.booksOpen, (_event, bookId: string) => services.library.openBook(bookId));
}

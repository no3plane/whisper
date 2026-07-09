import { ipcMain } from 'electron';
import { ipcChannels } from '../../shared/ipc';
import type { AISettings } from '../../shared/types';
import type { SettingsService } from '../settings/SettingsService';

export interface IpcServices {
  settings: SettingsService;
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
}

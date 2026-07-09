import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ReadingActionService } from './ai/ReadingActionService';
import { registerIpc } from './ipc/registerIpc';
import { LibraryService } from './library/LibraryService';
import { initLogger } from './logging/logger';
import { SettingsService } from './settings/SettingsService';
import { createDatabase } from './storage/database';
import { ThreadStore } from './threads/ThreadStore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void win.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(() => {
  initLogger();
  const db = createDatabase();
  const settings = new SettingsService(db);
  const library = new LibraryService(db);
  const threads = new ThreadStore(db);
  registerIpc({
    library,
    readingActions: new ReadingActionService(settings, library, threads),
    settings,
    threads,
  });
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

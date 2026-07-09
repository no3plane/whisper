import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('whisper', {
  version: '0.1.0',
});

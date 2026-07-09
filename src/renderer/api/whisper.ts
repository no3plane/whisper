import type { WhisperApi } from '../../preload';

declare global {
  interface Window {
    whisper?: WhisperApi;
  }
}

export function getWhisperApi(): WhisperApi {
  if (!window.whisper) {
    throw new Error('preload API 未加载：window.whisper 不存在。请重启应用或检查 Electron preload 配置。');
  }
  return window.whisper;
}

export const whisper = new Proxy({} as WhisperApi, {
  get(_target, property: keyof WhisperApi) {
    return getWhisperApi()[property];
  },
});

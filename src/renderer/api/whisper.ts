import type { WhisperApi } from '../../preload';

declare global {
  interface Window {
    whisper: WhisperApi;
  }
}

export const whisper = window.whisper;

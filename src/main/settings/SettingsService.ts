import type { AISettings } from '../../shared/types';
import type { AppDatabase } from '../storage/database';

const SETTINGS_KEY = 'ai';

export class SettingsService {
  constructor(private readonly db: AppDatabase) {}

  getAISettings(): AISettings | null {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(SETTINGS_KEY) as
      | { value: string }
      | undefined;
    if (!row) return null;
    return JSON.parse(row.value) as AISettings;
  }

  saveAISettings(settings: AISettings): void {
    this.db
      .prepare(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      )
      .run(SETTINGS_KEY, JSON.stringify(settings));
  }
}

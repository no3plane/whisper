import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { schemaSql } from './schema';
import { openDatabase } from './sqlite';

export type { AppDatabase } from './sqlite';

export function getAppDataDir() {
  const dir = path.join(app.getPath('userData'), 'whisper-data');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function createDatabase(dbPath = path.join(getAppDataDir(), 'whisper.sqlite')) {
  const db = openDatabase(dbPath);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec(schemaSql);
  return db;
}

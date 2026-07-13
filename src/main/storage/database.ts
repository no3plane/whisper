import Database from 'better-sqlite3';
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { schemaSql } from './schema';

export type AppDatabase = Database.Database;

export function getAppDataDir() {
  const dir = path.join(app.getPath('userData'), 'whisper-data');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function createDatabase(dbPath = path.join(getAppDataDir(), 'whisper.sqlite')) {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(schemaSql);
  return db;
}

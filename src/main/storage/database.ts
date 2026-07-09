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

function ensureBooksActiveThreadColumn(db: AppDatabase) {
  const columns = db.prepare('PRAGMA table_info(books)').all() as Array<{ name: string }>;
  const hasColumn = columns.some((column) => column.name === 'active_thread_id');
  if (!hasColumn) {
    db.exec('ALTER TABLE books ADD COLUMN active_thread_id TEXT');
  }
}

export function createDatabase(dbPath = path.join(getAppDataDir(), 'whisper.sqlite')) {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(schemaSql);
  ensureBooksActiveThreadColumn(db);
  return db;
}

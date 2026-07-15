import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { SCHEMA_VERSION, schemaSql } from './schema';
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
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all() as Array<{ name: string }>;
  if (tables.length === 0) {
    db.exec(schemaSql);
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  } else {
    const version = (db.prepare('PRAGMA user_version').get() as { user_version: number })
      .user_version;
    if (version !== SCHEMA_VERSION) {
      db.close();
      throw new Error(
        `数据库版本不兼容，请手动删除旧数据库后重试（当前 ${version}，需要 ${SCHEMA_VERSION}）。`,
      );
    }
  }
  return db;
}

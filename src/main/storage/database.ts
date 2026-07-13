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

function ensureColumn(db: AppDatabase, table: string, column: string, definition: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function migrateSchema(db: AppDatabase) {
  ensureColumn(db, 'books', 'active_thread_id', 'TEXT');
  ensureColumn(db, 'reading_threads', 'target_type', "TEXT NOT NULL DEFAULT 'book'");
  ensureColumn(db, 'reading_threads', 'target_chapter_id', 'TEXT');
  ensureColumn(db, 'reading_threads', 'target_start_passage_id', 'TEXT');
  ensureColumn(db, 'reading_threads', 'target_end_passage_id', 'TEXT');
  ensureColumn(db, 'reading_threads', 'target_selected_text', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, 'reading_threads', 'target_start_offset', 'INTEGER');
  ensureColumn(db, 'reading_threads', 'target_end_offset', 'INTEGER');
  ensureColumn(db, 'reading_threads', 'target_breadcrumb_json', "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(db, 'reading_threads', 'skill_type', 'TEXT');
  ensureColumn(db, 'reading_threads', 'last_error', 'TEXT');
  ensureColumn(db, 'thread_messages', 'reference_json', 'TEXT');
  ensureColumn(db, 'thread_messages', 'status', "TEXT NOT NULL DEFAULT 'ready'");
  ensureColumn(db, 'thread_messages', 'error', 'TEXT');

  db.transaction(() => {
    db.exec(`UPDATE reading_threads SET
      target_type = 'selection',
      target_chapter_id = chapter_id,
      target_start_passage_id = passage_id,
      target_end_passage_id = passage_id,
      target_selected_text = selected_text,
      skill_type = CASE action_type
        WHEN 'plain_explanation' THEN action_type
        WHEN 'concept_explanation' THEN action_type
        WHEN 'background_context' THEN action_type
        WHEN 'example_analogy' THEN action_type
        ELSE NULL
      END
      WHERE action_type <> '' AND target_type = 'book'`);
  })();
}

export function createDatabase(dbPath = path.join(getAppDataDir(), 'whisper.sqlite')) {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(schemaSql);
  migrateSchema(db);
  return db;
}

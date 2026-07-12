import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createDatabase } from '../../src/main/storage/database';
import { ThreadStore } from '../../src/main/threads/ThreadStore';

describe('数据库迁移', () => {
  const dirs: string[] = [];
  afterEach(() => dirs.splice(0).forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));

  it('把仅含旧列的会话升级并映射为 selection 目标', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-migration-')); dirs.push(dir);
    const dbPath = path.join(dir, 'legacy.sqlite');
    const legacy = new Database(dbPath);
    legacy.exec(`
      CREATE TABLE reading_threads (id TEXT PRIMARY KEY, book_id TEXT NOT NULL, chapter_id TEXT, passage_id TEXT, title TEXT NOT NULL, action_type TEXT NOT NULL, selected_text TEXT NOT NULL, context_strategy TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, status TEXT NOT NULL);
      CREATE TABLE thread_messages (id TEXT PRIMARY KEY, thread_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL, model TEXT, token_usage INTEGER, context_strategy TEXT);
    `);
    legacy.prepare('INSERT INTO reading_threads VALUES (?,?,?,?,?,?,?,?,?,?,?)').run('thread-1','book-1','chapter-1','passage-1','旧会话','plain_explanation','旧选区','full_book','2020','2020','ready');
    legacy.close();

    const db = createDatabase(dbPath);
    const thread = new ThreadStore(db).getThread('thread-1');
    expect(thread).toMatchObject({
      target: { type: 'selection', chapterId: 'chapter-1', startPassageId: 'passage-1', endPassageId: 'passage-1', selectedText: '旧选区', breadcrumb: [] },
      skillType: 'plain_explanation', lastError: null,
    });
    db.close();
  });
});

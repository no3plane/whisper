import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { ThreadStore } from '../../src/main/threads/ThreadStore';
import { schemaSql } from '../../src/main/storage/schema';

describe('ThreadStore', () => {
  let db: Database.Database | null = null;

  afterEach(() => {
    db?.close();
    db = null;
  });

  it('按 thread 隔离消息列表', () => {
    db = new Database(':memory:');
    db.exec(schemaSql);
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO books (
        id,
        title,
        author,
        format,
        original_file_path,
        library_file_path,
        created_at,
        updated_at,
        last_opened_at,
        preprocess_status,
        token_estimate,
        default_context_strategy
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('book-1', '测试书', null, 'markdown', '/tmp/original.md', '/tmp/library.md', now, now, null, 'ready', 10, 'full_book');
    const store = new ThreadStore(db);

    const first = store.createThread({
      bookId: 'book-1',
      title: '解释第一段',
      actionType: 'plain_explanation',
      selectedText: '第一段',
      contextStrategy: 'full_book',
    });
    const second = store.createThread({
      bookId: 'book-1',
      title: '解释第二段',
      actionType: 'plain_explanation',
      selectedText: '第二段',
      contextStrategy: 'full_book',
    });

    store.addMessage({
      threadId: first.id,
      role: 'assistant',
      content: '第一段的解释',
    });

    expect(store.listMessages(first.id)).toHaveLength(1);
    expect(store.listMessages(second.id)).toHaveLength(0);
  });
});

import { afterEach, describe, expect, it } from 'vitest';
import { ThreadStore } from '../../src/main/threads/ThreadStore';
import { openDatabase } from '../../src/main/storage/sqlite';
import type { AppDatabase } from '../../src/main/storage/sqlite';
import { schemaSql } from '../../src/main/storage/schema';

const selectionTarget = {
  type: 'selection' as const,
  chapterId: 'chapter-1',
  start: { blockId: 'passage-1', offset: 0 },
  end: { blockId: 'passage-1', offset: 3 },
  selectedText: '第一段',
  breadcrumb: [{ chapterId: 'chapter-1', title: '第一章' }],
};

function insertBook(db: AppDatabase) {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT OR IGNORE INTO books (id,title,original_file_path,library_file_path,created_at,updated_at,preprocess_status,token_estimate,default_context_strategy) VALUES (?,?,?,?,?,?,?,?,?)`,
  ).run(
    'book-1',
    '测试书',
    '/tmp/original.md',
    '/tmp/library.md',
    now,
    now,
    'ready',
    10,
    'full_book',
  );
}

describe('ThreadStore', () => {
  let db: AppDatabase | null = null;

  afterEach(() => {
    db?.close();
    db = null;
  });

  it('按 thread 隔离消息列表', () => {
    db = openDatabase(':memory:');
    db.exec(schemaSql);
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO books (
        id,
        title,
        author,
        original_file_path,
        library_file_path,
        created_at,
        updated_at,
        last_opened_at,
        preprocess_status,
        token_estimate,
        default_context_strategy
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'book-1',
      '测试书',
      null,
      '/tmp/original.md',
      '/tmp/library.md',
      now,
      now,
      null,
      'ready',
      10,
      'full_book',
    );
    const store = new ThreadStore(db);

    const first = store.createThread({
      bookId: 'book-1',
      title: '解释第一段',
      target: selectionTarget,
      skillType: 'plain_explanation',
      contextStrategy: 'full_book',
    });
    const second = store.createThread({
      bookId: 'book-1',
      title: '解释第二段',
      target: { ...selectionTarget, selectedText: '第二段' },
      skillType: 'plain_explanation',
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

  it('映射结构化目标和消息引用', () => {
    db = openDatabase(':memory:');
    db.exec(schemaSql);
    insertBook(db);
    const store = new ThreadStore(db);
    const thread = store.createThread({
      bookId: 'book-1',
      title: '解释',
      target: selectionTarget,
      skillType: 'plain_explanation',
      contextStrategy: 'hybrid',
    });
    const reference = {
      selectedText: '引用',
      start: { blockId: 'passage-2', offset: 1 },
      end: { blockId: 'passage-2', offset: 3 },
      breadcrumb: [{ chapterId: 'chapter-1', title: '第一章' }],
    };
    const message = store.addMessage({
      threadId: thread.id,
      role: 'user',
      content: '为什么？',
      reference,
      effectiveContextStrategy: 'compressed_book',
      degradationReason: '预算降级',
    });

    expect(store.getThread(thread.id)).toMatchObject({
      target: selectionTarget,
      skillType: 'plain_explanation',
      lastError: null,
    });
    expect(store.listMessages(thread.id)[0]).toMatchObject({
      id: message.id,
      reference,
      status: 'complete',
      effectiveContextStrategy: 'compressed_book',
      degradationReason: '预算降级',
      error: null,
    });
  });

  it('生成中的会话置顶，其余按更新时间倒序', () => {
    db = openDatabase(':memory:');
    db.exec(schemaSql);
    insertBook(db);
    const store = new ThreadStore(db);
    const ready = store.createThread({
      bookId: 'book-1',
      title: '新完成',
      target: selectionTarget,
      skillType: null,
      contextStrategy: 'full_book',
    });
    const streaming = store.createThread({
      bookId: 'book-1',
      title: '生成中',
      target: selectionTarget,
      skillType: null,
      contextStrategy: 'full_book',
      status: 'streaming',
    });
    db.prepare('UPDATE reading_threads SET updated_at = ? WHERE id = ?').run(
      '2000-01-01T00:00:00.000Z',
      streaming.id,
    );
    db.prepare('UPDATE reading_threads SET updated_at = ? WHERE id = ?').run(
      '2099-01-01T00:00:00.000Z',
      ready.id,
    );
    expect(store.listThreadsByBook('book-1').map((item) => item.id)).toEqual([
      streaming.id,
      ready.id,
    ]);
  });

  it('删除会话时同时删除消息并清空书籍活跃会话', () => {
    db = openDatabase(':memory:');
    db.exec(schemaSql);
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO books (id,title,original_file_path,library_file_path,created_at,updated_at,preprocess_status,token_estimate,default_context_strategy,active_thread_id) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    ).run('book-1', '书', 'a', 'b', now, now, 'ready', 1, 'full_book', null);
    const store = new ThreadStore(db);
    const thread = store.createThread({
      bookId: 'book-1',
      title: '会话',
      target: selectionTarget,
      skillType: null,
      contextStrategy: 'full_book',
    });
    store.addMessage({ threadId: thread.id, role: 'assistant', content: '回答' });
    db.prepare('UPDATE books SET active_thread_id = ? WHERE id = ?').run(thread.id, 'book-1');
    store.deleteThread(thread.id);
    expect(
      db.prepare('SELECT id FROM reading_threads WHERE id = ?').get(thread.id),
    ).toBeUndefined();
    expect(db.prepare('SELECT id FROM thread_messages WHERE thread_id = ?').all(thread.id)).toEqual(
      [],
    );
    expect(db.prepare('SELECT active_thread_id FROM books WHERE id = ?').get('book-1')).toEqual({
      active_thread_id: null,
    });
  });

  it('失败与重试复用原 assistant message ID', () => {
    db = openDatabase(':memory:');
    db.exec(schemaSql);
    insertBook(db);
    const store = new ThreadStore(db);
    const thread = store.createThread({
      bookId: 'book-1',
      title: '会话',
      target: selectionTarget,
      skillType: null,
      contextStrategy: 'full_book',
    });
    const message = store.addMessage({
      threadId: thread.id,
      role: 'assistant',
      content: '部分',
      status: 'streaming',
    });
    store.markMessageFailed(message.id, '网络错误');
    expect(store.listMessages(thread.id)[0]).toMatchObject({
      id: message.id,
      status: 'failed',
      error: '网络错误',
    });
    const retried = store.resetMessageForRetry(message.id);
    expect(retried).toMatchObject({
      id: message.id,
      content: '',
      status: 'streaming',
      error: null,
    });
    const completed = store.updateMessage(message.id, {
      content: '重试成功',
      status: 'complete',
      error: null,
    });
    expect(completed).toMatchObject({
      id: message.id,
      content: '重试成功',
      status: 'complete',
      error: null,
    });
    expect(store.listMessages(thread.id)).toHaveLength(1);
  });

  it('拒绝重试 user message 且不修改原消息', () => {
    db = openDatabase(':memory:');
    db.exec(schemaSql);
    insertBook(db);
    const store = new ThreadStore(db);
    const thread = store.createThread({
      bookId: 'book-1',
      title: '会话',
      target: selectionTarget,
      skillType: null,
      contextStrategy: 'full_book',
    });
    const message = store.addMessage({ threadId: thread.id, role: 'user', content: '原问题' });

    expect(() => store.resetMessageForRetry(message.id)).toThrow('只能重试 assistant message');
    expect(store.listMessages(thread.id)[0]).toMatchObject({
      id: message.id,
      content: '原问题',
      status: 'complete',
    });
  });

  it('损坏的目标和引用 JSON 不会阻断列表映射', () => {
    db = openDatabase(':memory:');
    db.exec(schemaSql);
    insertBook(db);
    const store = new ThreadStore(db);
    const thread = store.createThread({
      bookId: 'book-1',
      title: '会话',
      target: selectionTarget,
      skillType: null,
      contextStrategy: 'full_book',
    });
    store.addMessage({ threadId: thread.id, role: 'user', content: '问题' });
    db.prepare(
      'UPDATE reading_threads SET target_breadcrumb_json = ?, skill_type = ? WHERE id = ?',
    ).run('{bad', 'unknown_action', thread.id);
    db.prepare('UPDATE thread_messages SET reference_json = ? WHERE thread_id = ?').run(
      '{bad',
      thread.id,
    );

    expect(store.listThreadsByBook('book-1')[0].target.breadcrumb).toEqual([]);
    expect(store.listThreadsByBook('book-1')[0].skillType).toBeNull();
    expect(store.listMessages(thread.id)[0].reference).toBeNull();
  });
});

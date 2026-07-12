import { randomUUID } from 'node:crypto';
import type { BookThreadsPayload, ContextStrategy, MessageReference, ReadingSkillType, ReadingTarget, ReadingThread, ThreadMessage } from '../../shared/types';
import type { AppDatabase } from '../storage/database';

interface ReadingThreadRow {
  id: string;
  book_id: string;
  title: string;
  target_type: ReadingTarget['type'];
  target_chapter_id: string | null;
  target_start_passage_id: string | null;
  target_end_passage_id: string | null;
  target_selected_text: string;
  target_start_offset: number | null;
  target_end_offset: number | null;
  target_breadcrumb_json: string;
  skill_type: ReadingSkillType | null;
  context_strategy: ContextStrategy;
  created_at: string;
  updated_at: string;
  status: ReadingThread['status'];
  last_error: string | null;
}

interface ThreadMessageRow {
  id: string;
  thread_id: string;
  role: ThreadMessage['role'];
  content: string;
  created_at: string;
  model: string | null;
  token_usage: number | null;
  context_strategy: ContextStrategy | null;
  reference_json: string | null;
  status: ThreadMessage['status'];
  error: string | null;
}

export interface CreateThreadInput {
  bookId: string;
  title: string;
  target: ReadingTarget;
  skillType: ReadingSkillType | null;
  contextStrategy: ContextStrategy;
  status?: ReadingThread['status'];
}

export interface AddMessageInput {
  threadId: string;
  role: ThreadMessage['role'];
  content: string;
  model?: string | null;
  tokenUsage?: number | null;
  contextStrategy?: ContextStrategy | null;
  reference?: MessageReference | null;
  status?: ThreadMessage['status'];
  error?: string | null;
}

function mapThreadRow(row: ReadingThreadRow): ReadingThread {
  return {
    id: row.id,
    bookId: row.book_id,
    title: row.title,
    target: {
      type: row.target_type,
      chapterId: row.target_chapter_id,
      startPassageId: row.target_start_passage_id,
      endPassageId: row.target_end_passage_id,
      selectedText: row.target_selected_text,
      startOffset: row.target_start_offset,
      endOffset: row.target_end_offset,
      breadcrumb: JSON.parse(row.target_breadcrumb_json),
    },
    skillType: row.skill_type,
    contextStrategy: row.context_strategy,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    status: row.status,
    lastError: row.last_error,
  };
}

function mapMessageRow(row: ThreadMessageRow): ThreadMessage {
  return {
    id: row.id,
    threadId: row.thread_id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at,
    model: row.model,
    tokenUsage: row.token_usage,
    contextStrategy: row.context_strategy,
    reference: row.reference_json ? JSON.parse(row.reference_json) : null,
    status: row.status,
    error: row.error,
  };
}

export class ThreadStore {
  constructor(private readonly db: AppDatabase) {}

  createThread(input: CreateThreadInput): ReadingThread {
    const now = new Date().toISOString();
    const thread: ReadingThread = {
      id: randomUUID(),
      bookId: input.bookId,
      title: input.title,
      target: input.target,
      skillType: input.skillType,
      contextStrategy: input.contextStrategy,
      createdAt: now,
      updatedAt: now,
      status: input.status ?? 'ready',
      lastError: null,
    };

    this.db
      .prepare(
        `INSERT INTO reading_threads (
          id,
          book_id,
          title,
          target_type, target_chapter_id, target_start_passage_id, target_end_passage_id,
          target_selected_text, target_start_offset, target_end_offset, target_breadcrumb_json, skill_type,
          context_strategy,
          created_at,
          updated_at,
          status, last_error
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        thread.id,
        thread.bookId,
        thread.title,
        thread.target.type,
        thread.target.chapterId,
        thread.target.startPassageId,
        thread.target.endPassageId,
        thread.target.selectedText,
        thread.target.startOffset,
        thread.target.endOffset,
        JSON.stringify(thread.target.breadcrumb),
        thread.skillType,
        thread.contextStrategy,
        thread.createdAt,
        thread.updatedAt,
        thread.status,
        thread.lastError,
      );

    return thread;
  }

  addMessage(input: AddMessageInput): ThreadMessage {
    const now = new Date().toISOString();
    const message: ThreadMessage = {
      id: randomUUID(),
      threadId: input.threadId,
      role: input.role,
      content: input.content,
      createdAt: now,
      model: input.model ?? null,
      tokenUsage: input.tokenUsage ?? null,
      contextStrategy: input.contextStrategy ?? null,
      reference: input.reference ?? null,
      status: input.status ?? 'ready',
      error: input.error ?? null,
    };

    const insert = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO thread_messages (
            id,
            thread_id,
            role,
            content,
            created_at,
            model,
            token_usage,
            context_strategy, reference_json, status, error
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          message.id,
          message.threadId,
          message.role,
          message.content,
          message.createdAt,
          message.model,
          message.tokenUsage,
          message.contextStrategy,
          message.reference ? JSON.stringify(message.reference) : null,
          message.status,
          message.error,
        );

      this.db.prepare('UPDATE reading_threads SET updated_at = ? WHERE id = ?').run(now, input.threadId);
    });

    insert();
    return message;
  }

  listMessages(threadId: string): ThreadMessage[] {
    const rows = this.db
      .prepare('SELECT * FROM thread_messages WHERE thread_id = ? ORDER BY created_at ASC')
      .all(threadId) as ThreadMessageRow[];
    return rows.map(mapMessageRow);
  }

  listThreadsByBook(bookId: string): ReadingThread[] {
    const rows = this.db
      .prepare("SELECT * FROM reading_threads WHERE book_id = ? ORDER BY CASE WHEN status = 'streaming' THEN 0 ELSE 1 END, updated_at DESC")
      .all(bookId) as ReadingThreadRow[];
    return rows.map(mapThreadRow);
  }

  listThreadsWithMessagesByBook(bookId: string): BookThreadsPayload {
    const threads = this.listThreadsByBook(bookId);
    const bookRow = this.db.prepare('SELECT active_thread_id FROM books WHERE id = ?').get(bookId) as
      | { active_thread_id: string | null }
      | undefined;

    if (!bookRow) {
      throw new Error(`找不到书籍：${bookId}`);
    }

    const storedActiveId = bookRow.active_thread_id;
    const activeThreadId =
      storedActiveId && threads.some((thread) => thread.id === storedActiveId) ? storedActiveId : null;

    return {
      threads: threads.map((thread) => ({
        thread,
        messages: this.listMessages(thread.id),
      })),
      activeThreadId,
    };
  }

  getThread(threadId: string): ReadingThread {
    const row = this.db.prepare('SELECT * FROM reading_threads WHERE id = ?').get(threadId) as
      | ReadingThreadRow
      | undefined;
    if (!row) {
      throw new Error(`找不到 thread：${threadId}`);
    }
    return mapThreadRow(row);
  }

  updateThreadStatus(threadId: string, status: ReadingThread['status']): ReadingThread {
    const now = new Date().toISOString();
    this.db
      .prepare('UPDATE reading_threads SET status = ?, updated_at = ? WHERE id = ?')
      .run(status, now, threadId);
    return this.getThread(threadId);
  }

  deleteThread(threadId: string): void {
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM thread_messages WHERE thread_id = ?').run(threadId);
      this.db.prepare('DELETE FROM reading_threads WHERE id = ?').run(threadId);
      this.db.prepare('UPDATE books SET active_thread_id = NULL WHERE active_thread_id = ?').run(threadId);
    })();
  }

  markMessageFailed(messageId: string, error: string): ThreadMessage {
    const existing = this.db.prepare('SELECT thread_id FROM thread_messages WHERE id = ?').get(messageId) as { thread_id: string } | undefined;
    if (!existing) throw new Error(`找不到 message：${messageId}`);
    this.db.transaction(() => {
      this.db.prepare("UPDATE thread_messages SET status = 'failed', error = ? WHERE id = ?").run(error, messageId);
      this.db.prepare("UPDATE reading_threads SET status = 'failed', last_error = ?, updated_at = ? WHERE id = ?").run(error, new Date().toISOString(), existing.thread_id);
    })();
    return mapMessageRow(this.db.prepare('SELECT * FROM thread_messages WHERE id = ?').get(messageId) as ThreadMessageRow);
  }

  resetMessageForRetry(messageId: string): ThreadMessage {
    const existing = this.db.prepare('SELECT thread_id FROM thread_messages WHERE id = ?').get(messageId) as { thread_id: string } | undefined;
    if (!existing) throw new Error(`找不到 message：${messageId}`);
    this.db.transaction(() => {
      this.db.prepare("UPDATE thread_messages SET content = '', status = 'streaming', error = NULL WHERE id = ?").run(messageId);
      this.db.prepare("UPDATE reading_threads SET status = 'streaming', last_error = NULL, updated_at = ? WHERE id = ?").run(new Date().toISOString(), existing.thread_id);
    })();
    return mapMessageRow(this.db.prepare('SELECT * FROM thread_messages WHERE id = ?').get(messageId) as ThreadMessageRow);
  }

  updateMessage(
    messageId: string,
    patch: {
      content?: string;
      model?: string | null;
      tokenUsage?: number | null;
    },
  ): ThreadMessage {
    const existing = this.db.prepare('SELECT * FROM thread_messages WHERE id = ?').get(messageId) as
      | ThreadMessageRow
      | undefined;
    if (!existing) {
      throw new Error(`找不到 message：${messageId}`);
    }

    const content = patch.content ?? existing.content;
    const model = patch.model !== undefined ? patch.model : existing.model;
    const tokenUsage = patch.tokenUsage !== undefined ? patch.tokenUsage : existing.token_usage;
    const now = new Date().toISOString();

    this.db.transaction(() => {
      this.db
        .prepare(
          `UPDATE thread_messages
           SET content = ?, model = ?, token_usage = ?
           WHERE id = ?`,
        )
        .run(content, model, tokenUsage, messageId);
      this.db.prepare('UPDATE reading_threads SET updated_at = ? WHERE id = ?').run(now, existing.thread_id);
    })();

    const row = this.db.prepare('SELECT * FROM thread_messages WHERE id = ?').get(messageId) as ThreadMessageRow;
    return mapMessageRow(row);
  }
}

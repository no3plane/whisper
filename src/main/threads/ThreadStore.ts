import { randomUUID } from 'node:crypto';
import type { ContextStrategy, ReadingActionType, ReadingThread, ThreadMessage } from '../../shared/types';
import type { AppDatabase } from '../storage/database';

interface ReadingThreadRow {
  id: string;
  book_id: string;
  chapter_id: string | null;
  passage_id: string | null;
  title: string;
  action_type: ReadingActionType;
  selected_text: string;
  context_strategy: ContextStrategy;
  created_at: string;
  updated_at: string;
  status: ReadingThread['status'];
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
}

export interface CreateThreadInput {
  bookId: string;
  chapterId?: string | null;
  passageId?: string | null;
  title: string;
  actionType: ReadingActionType;
  selectedText: string;
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
}

function mapThreadRow(row: ReadingThreadRow): ReadingThread {
  return {
    id: row.id,
    bookId: row.book_id,
    chapterId: row.chapter_id,
    passageId: row.passage_id,
    title: row.title,
    actionType: row.action_type,
    selectedText: row.selected_text,
    contextStrategy: row.context_strategy,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    status: row.status,
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
  };
}

export class ThreadStore {
  constructor(private readonly db: AppDatabase) {}

  createThread(input: CreateThreadInput): ReadingThread {
    const now = new Date().toISOString();
    const thread: ReadingThread = {
      id: randomUUID(),
      bookId: input.bookId,
      chapterId: input.chapterId ?? null,
      passageId: input.passageId ?? null,
      title: input.title,
      actionType: input.actionType,
      selectedText: input.selectedText,
      contextStrategy: input.contextStrategy,
      createdAt: now,
      updatedAt: now,
      status: input.status ?? 'ready',
    };

    this.db
      .prepare(
        `INSERT INTO reading_threads (
          id,
          book_id,
          chapter_id,
          passage_id,
          title,
          action_type,
          selected_text,
          context_strategy,
          created_at,
          updated_at,
          status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        thread.id,
        thread.bookId,
        thread.chapterId,
        thread.passageId,
        thread.title,
        thread.actionType,
        thread.selectedText,
        thread.contextStrategy,
        thread.createdAt,
        thread.updatedAt,
        thread.status,
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
            context_strategy
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
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
      .prepare('SELECT * FROM reading_threads WHERE book_id = ? ORDER BY updated_at DESC')
      .all(bookId) as ReadingThreadRow[];
    return rows.map(mapThreadRow);
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
}

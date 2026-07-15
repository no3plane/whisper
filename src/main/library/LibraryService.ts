import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { analyzeMarkdown } from '../../shared/markdown/analyzeMarkdown';
import type { Book, BookDocument, ContextStrategy, PreprocessStatus } from '../../shared/types';
import { logger } from '../logging/logger';
import { getAppDataDir, type AppDatabase } from '../storage/database';
import { MarkdownResourceService } from './MarkdownResourceService';

interface BookRow {
  id: string;
  title: string;
  author: string | null;
  original_file_path: string;
  library_file_path: string;
  created_at: string;
  updated_at: string;
  last_opened_at: string | null;
  preprocess_status: PreprocessStatus;
  token_estimate: number;
  default_context_strategy: ContextStrategy;
  active_thread_id: string | null;
}

function mapBook(row: BookRow): Book {
  return {
    id: row.id,
    title: row.title,
    author: row.author,
    originalFilePath: row.original_file_path,
    libraryFilePath: row.library_file_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastOpenedAt: row.last_opened_at,
    preprocessStatus: row.preprocess_status,
    tokenEstimate: row.token_estimate,
    defaultContextStrategy: row.default_context_strategy,
    activeThreadId: row.active_thread_id,
  };
}

export class LibraryService {
  private readonly resources = new MarkdownResourceService();

  constructor(private readonly db: AppDatabase) {}

  importMarkdown(filePath: string): Book {
    if (path.extname(filePath).toLowerCase() !== '.md') {
      throw new Error('不支持的文件格式，仅支持 .md。');
    }
    const bookId = randomUUID();
    const fileName = path.basename(filePath);
    const bookDir = path.join(getAppDataDir(), 'books', bookId);
    const libraryFilePath = path.join(bookDir, fileName);
    fs.mkdirSync(bookDir, { recursive: true });
    fs.copyFileSync(filePath, libraryFilePath);
    try {
      const markdown = fs.readFileSync(libraryFilePath, 'utf8');
      const analysis = analyzeMarkdown({ bookId, markdown });
      this.resources.import(markdown, filePath, bookDir);
      const now = new Date().toISOString();
      const book: Book = {
        id: bookId,
        title: path.basename(filePath, '.md'),
        author: null,
        originalFilePath: filePath,
        libraryFilePath,
        createdAt: now,
        updatedAt: now,
        lastOpenedAt: null,
        preprocessStatus: 'not_started',
        tokenEstimate: Math.ceil(analysis.structuredText.length / 3),
        defaultContextStrategy: 'full_book',
        activeThreadId: null,
      };
      this.db
        .prepare(
          `INSERT INTO books (id,title,author,original_file_path,library_file_path,created_at,updated_at,last_opened_at,preprocess_status,token_estimate,default_context_strategy,active_thread_id)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          book.id,
          book.title,
          book.author,
          book.originalFilePath,
          book.libraryFilePath,
          book.createdAt,
          book.updatedAt,
          book.lastOpenedAt,
          book.preprocessStatus,
          book.tokenEstimate,
          book.defaultContextStrategy,
          book.activeThreadId,
        );
      return book;
    } catch (error) {
      logger.error('books.import', {
        filePath,
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  listBooks(): Book[] {
    return (
      this.db.prepare('SELECT * FROM books ORDER BY created_at DESC').all() as unknown as BookRow[]
    ).map(mapBook);
  }

  openBook(bookId: string): BookDocument {
    const row = this.db.prepare('SELECT * FROM books WHERE id = ?').get(bookId) as
      | BookRow
      | undefined;
    if (!row) {
      throw new Error(`Book not found: ${bookId}`);
    }
    const openedAt = new Date().toISOString();
    this.db
      .prepare('UPDATE books SET last_opened_at = ?, updated_at = ? WHERE id = ?')
      .run(openedAt, openedAt, bookId);
    const book = mapBook({ ...row, last_opened_at: openedAt, updated_at: openedAt });
    const markdown = fs.readFileSync(book.libraryFilePath, 'utf8');
    const analysis = analyzeMarkdown({ bookId, markdown });
    return {
      book,
      markdown,
      chapters: analysis.chapters,
      blocks: analysis.blocks,
      resources: this.resources.read(path.dirname(book.libraryFilePath)),
      fullText: analysis.structuredText,
    };
  }

  setActiveThread(bookId: string, threadId: string | null): void {
    if (
      this.db.prepare('UPDATE books SET active_thread_id = ? WHERE id = ?').run(threadId, bookId)
        .changes === 0
    ) {
      throw new Error(`Book not found: ${bookId}`);
    }
  }

  setDefaultContextStrategy(bookId: string, strategy: ContextStrategy): void {
    if (
      this.db
        .prepare('UPDATE books SET default_context_strategy = ?, updated_at = ? WHERE id = ?')
        .run(strategy, new Date().toISOString(), bookId).changes === 0
    ) {
      throw new Error(`Book not found: ${bookId}`);
    }
  }
}

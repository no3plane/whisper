import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  Book,
  BookDocument,
  Chapter,
  ContextStrategy,
  Passage,
  PreprocessStatus,
} from '../../shared/types';
import { logger } from '../logging/logger';
import { getAppDataDir } from '../storage/database';
import type { AppDatabase } from '../storage/database';
import { MarkdownParser } from './MarkdownParser';
import { EpubParser } from './EpubParser';

interface BookRow {
  id: string;
  title: string;
  author: string | null;
  format: Book['format'];
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

interface ChapterRow {
  id: string;
  book_id: string;
  parent_chapter_id: string | null;
  title: string;
  level: number;
  chapter_order: number;
  start_passage_id: string;
  end_passage_id: string;
  summary: string | null;
}

interface PassageRow {
  id: string;
  book_id: string;
  chapter_id: string | null;
  passage_order: number;
  text: string;
  source_href: string | null;
  source_offset: number;
}

function mapBookRow(row: BookRow): Book {
  return {
    id: row.id,
    title: row.title,
    author: row.author,
    format: row.format,
    originalFilePath: row.original_file_path,
    libraryFilePath: row.library_file_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastOpenedAt: row.last_opened_at,
    preprocessStatus: row.preprocess_status,
    tokenEstimate: row.token_estimate,
    defaultContextStrategy: row.default_context_strategy,
    activeThreadId: row.active_thread_id ?? null,
  };
}

function mapChapterRow(row: ChapterRow): Chapter {
  return {
    id: row.id,
    bookId: row.book_id,
    parentChapterId: row.parent_chapter_id,
    title: row.title,
    level: row.level,
    order: row.chapter_order,
    startPassageId: row.start_passage_id,
    endPassageId: row.end_passage_id,
    summary: row.summary,
  };
}

function mapPassageRow(row: PassageRow): Passage {
  return {
    id: row.id,
    bookId: row.book_id,
    chapterId: row.chapter_id,
    order: row.passage_order,
    text: row.text,
    sourceHref: row.source_href,
    sourceOffset: row.source_offset,
  };
}

export class LibraryService {
  private readonly parser = new MarkdownParser();
  private readonly epubParser = new EpubParser();

  constructor(private readonly db: AppDatabase) {}

  importMarkdown(filePath: string): Book {
    try {
      const bookId = randomUUID();
      const fileName = path.basename(filePath);
      const title = path.basename(filePath, path.extname(filePath));
      const bookDir = path.join(getAppDataDir(), 'books', bookId);
      const libraryFilePath = path.join(bookDir, fileName);

      fs.mkdirSync(bookDir, { recursive: true });
      fs.copyFileSync(filePath, libraryFilePath);

      const markdown = fs.readFileSync(libraryFilePath, 'utf8');
      const parsed = this.parser.parse({ bookId, markdown });
      const now = new Date().toISOString();
      const book: Book = {
        id: bookId,
        title,
        author: null,
        format: 'markdown',
        originalFilePath: filePath,
        libraryFilePath,
        createdAt: now,
        updatedAt: now,
        lastOpenedAt: null,
        preprocessStatus: 'not_started',
        tokenEstimate: Math.ceil(parsed.fullText.length / 3),
        defaultContextStrategy: 'full_book',
        activeThreadId: null,
      };

      const insert = this.db.transaction(() => {
        this.db
          .prepare(
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
            default_context_strategy,
            active_thread_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            book.id,
            book.title,
            book.author,
            book.format,
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

        const insertChapter = this.db.prepare(
          `INSERT INTO chapters (
          id,
          book_id,
          parent_chapter_id,
          title,
          level,
          chapter_order,
          start_passage_id,
          end_passage_id,
          summary
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        );
        for (const chapter of parsed.chapters) {
          insertChapter.run(
            chapter.id,
            chapter.bookId,
            chapter.parentChapterId,
            chapter.title,
            chapter.level,
            chapter.order,
            chapter.startPassageId,
            chapter.endPassageId,
            chapter.summary,
          );
        }

        const insertPassage = this.db.prepare(
          `INSERT INTO passages (
          id,
          book_id,
          chapter_id,
          passage_order,
          text,
          source_href,
          source_offset
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        );
        for (const passage of parsed.passages) {
          insertPassage.run(
            passage.id,
            passage.bookId,
            passage.chapterId,
            passage.order,
            passage.text,
            passage.sourceHref,
            passage.sourceOffset,
          );
        }
      });

      insert();
      logger.info('books.import', {
        filePath,
        bookId: book.id,
        title: book.title,
      });
      return book;
    } catch (error) {
      logger.error('books.import', {
        filePath,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  importEpub(filePath: string): Book {
    const bookId = randomUUID();
    const fileName = path.basename(filePath);
    const title = path.basename(filePath, path.extname(filePath));
    const bookDir = path.join(getAppDataDir(), 'books', bookId);
    const libraryFilePath = path.join(bookDir, fileName);
    fs.mkdirSync(bookDir, { recursive: true });
    fs.copyFileSync(filePath, libraryFilePath);
    try {
      const parsed = this.epubParser.parse({ bookId, buffer: fs.readFileSync(libraryFilePath) });
      const now = new Date().toISOString();
      const book: Book = {
        id: bookId,
        title,
        author: null,
        format: 'epub',
        originalFilePath: filePath,
        libraryFilePath,
        createdAt: now,
        updatedAt: now,
        lastOpenedAt: null,
        preprocessStatus: 'not_started',
        tokenEstimate: Math.ceil(parsed.fullText.length / 3),
        defaultContextStrategy: 'full_book',
        activeThreadId: null,
      };
      this.db.transaction(() => {
        this.db
          .prepare(
            `INSERT INTO books (id,title,author,format,original_file_path,library_file_path,created_at,updated_at,last_opened_at,preprocess_status,token_estimate,default_context_strategy,active_thread_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          )
          .run(
            book.id,
            book.title,
            null,
            book.format,
            filePath,
            libraryFilePath,
            now,
            now,
            null,
            book.preprocessStatus,
            book.tokenEstimate,
            book.defaultContextStrategy,
            null,
          );
        const insertChapter = this.db.prepare(
          `INSERT INTO chapters (id,book_id,parent_chapter_id,title,level,chapter_order,start_passage_id,end_passage_id,summary) VALUES (?,?,?,?,?,?,?,?,?)`,
        );
        parsed.chapters.forEach((c) =>
          insertChapter.run(
            c.id,
            c.bookId,
            c.parentChapterId,
            c.title,
            c.level,
            c.order,
            c.startPassageId,
            c.endPassageId,
            c.summary,
          ),
        );
        const insertPassage = this.db.prepare(
          `INSERT INTO passages (id,book_id,chapter_id,passage_order,text,source_href,source_offset) VALUES (?,?,?,?,?,?,?)`,
        );
        parsed.passages.forEach((p) =>
          insertPassage.run(
            p.id,
            p.bookId,
            p.chapterId,
            p.order,
            p.text,
            p.sourceHref,
            p.sourceOffset,
          ),
        );
      })();
      return book;
    } catch (error) {
      logger.error('books.import.epub', {
        filePath,
        bookId,
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  listBooks(): Book[] {
    const rows = this.db
      .prepare('SELECT * FROM books ORDER BY created_at DESC')
      .all() as unknown as BookRow[];
    return rows.map(mapBookRow);
  }

  openBook(bookId: string): BookDocument {
    const bookRow = this.db.prepare('SELECT * FROM books WHERE id = ?').get(bookId) as
      | BookRow
      | undefined;
    if (!bookRow) {
      logger.error('books.open', { bookId, message: `Book not found: ${bookId}` });
      throw new Error(`Book not found: ${bookId}`);
    }

    const openedAt = new Date().toISOString();
    this.db
      .prepare('UPDATE books SET last_opened_at = ?, updated_at = ? WHERE id = ?')
      .run(openedAt, openedAt, bookId);

    const book = mapBookRow({
      ...bookRow,
      updated_at: openedAt,
      last_opened_at: openedAt,
    });
    const chapters = (
      this.db
        .prepare('SELECT * FROM chapters WHERE book_id = ? ORDER BY chapter_order ASC')
        .all(bookId) as unknown as ChapterRow[]
    ).map(mapChapterRow);
    const passages = (
      this.db
        .prepare('SELECT * FROM passages WHERE book_id = ? ORDER BY passage_order ASC')
        .all(bookId) as unknown as PassageRow[]
    ).map(mapPassageRow);

    logger.info('books.open', { bookId, title: book.title });

    return {
      book,
      chapters,
      passages,
      fullText: passages.map((passage) => passage.text).join('\n\n'),
    };
  }

  setActiveThread(bookId: string, threadId: string | null): void {
    const result = this.db
      .prepare('UPDATE books SET active_thread_id = ? WHERE id = ?')
      .run(threadId, bookId);
    if (result.changes === 0) {
      throw new Error(`Book not found: ${bookId}`);
    }
  }

  setDefaultContextStrategy(bookId: string, strategy: ContextStrategy): void {
    const result = this.db
      .prepare('UPDATE books SET default_context_strategy = ?, updated_at = ? WHERE id = ?')
      .run(strategy, new Date().toISOString(), bookId);
    if (result.changes === 0) {
      throw new Error(`Book not found: ${bookId}`);
    }
  }
}

import { useEffect, useState } from 'react';
import type { Book } from '../../../shared/types';
import { whisper } from '../../api/whisper';
import styles from './LibraryPage.module.css';

interface LibraryPageProps {
  onOpenBook: (bookId: string) => void;
}

export function LibraryPage({ onOpenBook }: LibraryPageProps) {
  const [books, setBooks] = useState<Book[]>([]);
  const [filePath, setFilePath] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  async function loadBooks() {
    setIsLoading(true);
    try {
      setBooks(await whisper.books.list());
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadBooks().catch((reason) => setError(messageOf(reason)));
  }, []);

  async function importMarkdown() {
    try {
      setError('');
      await whisper.books.importMarkdown({ filePath });
      setFilePath('');
      await loadBooks();
    } catch (err) {
      setError(messageOf(err));
    }
  }

  async function importEpub() {
    try {
      setError('');
      await whisper.books.importEpub({ filePath });
      setFilePath('');
      await loadBooks();
    } catch (err) {
      setError(messageOf(err));
    }
  }

  return (
    <section className={styles.page} aria-labelledby="library-title">
      <header className={styles.header}>
        <div>
          <span>YOUR READING ROOM</span>
          <h2 id="library-title">我的书房</h2>
        </div>
      </header>
      <div className={styles.importRow}>
        <input
          aria-label="本机书籍文件路径"
          placeholder="输入本机书籍文件路径"
          value={filePath}
          onChange={(event) => setFilePath(event.target.value)}
        />
        <button onClick={importMarkdown} disabled={!filePath.trim()}>
          导入 Markdown
        </button>
        <button onClick={importEpub} disabled={!filePath.trim()}>
          导入 EPUB
        </button>
      </div>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      {isLoading ? (
        <div className={styles.loadingState} role="status">
          正在整理书房…
        </div>
      ) : books.length === 0 ? (
        <div className={styles.emptyState}>
          <h3>书房还是空的</h3>
          <p>输入本机 Markdown 或 EPUB 路径开始阅读。</p>
        </div>
      ) : (
        <div className={styles.bookList}>
          {books.map((book, index) => (
            <article className={styles.bookItem} key={book.id}>
              <button aria-label={`打开《${book.title}》`} onClick={() => onOpenBook(book.id)}>
                <span className={styles.cover} data-cover-variant={(index % 3) + 1}>
                  {book.title}
                </span>
              </button>
              <strong>{book.title}</strong>
              <span>
                {book.author ?? '作者未知'} · {book.format.toUpperCase()}
              </span>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function messageOf(reason: unknown) {
  return reason instanceof Error ? reason.message : String(reason);
}

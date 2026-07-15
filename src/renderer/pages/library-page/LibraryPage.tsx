import { useEffect, useRef, useState } from 'react';
import type { Book } from '../../../shared/types';
import { whisper } from '../../api/whisper';
import styles from './LibraryPage.module.css';

interface LibraryPageProps {
  onOpenBook: (bookId: string) => void;
}

export function LibraryPage({ onOpenBook }: LibraryPageProps) {
  const [books, setBooks] = useState<Book[]>([]);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  async function importBooks(files: File[]) {
    setIsImporting(true);
    try {
      setError('');
      setFeedback('');
      const result = await whisper.books.importFiles(files);

      if (result.imported.length > 0) {
        await loadBooks();
      }
      if (result.failed.length > 0) {
        const details = result.failed
          .map((failure) => `${failure.fileName}：${failure.reason}`)
          .join('；');
        setError(`成功 ${result.imported.length} 本，失败 ${result.failed.length} 本。${details}`);
      } else if (result.imported.length > 0) {
        setFeedback(`已导入 ${result.imported.length} 本书`);
      }
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setIsImporting(false);
    }
  }

  function handleFileSelection(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length > 0) {
      void importBooks(files);
    }
  }

  const importButton = (
    <button
      className={styles.importButton}
      title="支持 Markdown，可多选"
      onClick={() => fileInputRef.current?.click()}
      disabled={isImporting}
    >
      <span aria-hidden="true">＋</span>
      {isImporting ? '正在导入…' : '导入书籍'}
    </button>
  );

  return (
    <section className={styles.page} aria-label="书库">
      <input
        ref={fileInputRef}
        className={styles.fileInput}
        type="file"
        accept=".md"
        multiple
        tabIndex={-1}
        aria-hidden="true"
        onChange={handleFileSelection}
      />
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      {feedback ? (
        <p className={styles.feedback} role="status">
          {feedback}
        </p>
      ) : null}
      {isLoading ? (
        <div className={styles.loadingState} role="status">
          正在整理书房…
        </div>
      ) : books.length === 0 ? (
        <div className={styles.emptyState} role="region" aria-label="空书库">
          <h3>书房还是空的</h3>
          <p>选择 Markdown，把第一本书放进书房。</p>
          {importButton}
        </div>
      ) : (
        <div className={styles.bookList} role="region" aria-label="藏书">
          <button
            className={styles.addBookButton}
            aria-label="导入书籍"
            title="支持 Markdown，可多选"
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
          >
            <span aria-hidden="true">＋</span>
            {isImporting ? '正在导入…' : '导入书籍'}
          </button>
          {books.map((book, index) => (
            <article className={styles.bookItem} key={book.id}>
              <button aria-label={`打开《${book.title}》`} onClick={() => onOpenBook(book.id)}>
                <span className={styles.cover} data-cover-variant={(index % 3) + 1}>
                  {book.title}
                </span>
              </button>
              <strong>{book.title}</strong>
              <span>{book.author ?? '作者未知'} · Markdown</span>
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

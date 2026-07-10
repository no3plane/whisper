import { useEffect, useState } from 'react';
import type { Book } from '../../shared/types';
import { whisper } from '../api/whisper';

interface LibraryPageProps {
  onOpenBook: (bookId: string) => void;
}

export function LibraryPage({ onOpenBook }: LibraryPageProps) {
  const [books, setBooks] = useState<Book[]>([]);
  const [filePath, setFilePath] = useState('');
  const [error, setError] = useState('');

  async function loadBooks() {
    setBooks(await whisper.books.list());
  }

  useEffect(() => {
    void loadBooks();
  }, []);

  async function importMarkdown() {
    try {
      setError('');
      await whisper.books.importMarkdown({ filePath });
      setFilePath('');
      await loadBooks();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function importEpub() {
    try { setError(''); await whisper.books.importEpub({ filePath }); setFilePath(''); await loadBooks(); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
  }

  return (
    <section className="library-page">
      <div className="page-header">
        <h2>书库</h2>
      </div>
      <div className="import-row">
        <input placeholder="输入本机 markdown 文件路径" value={filePath} onChange={(event) => setFilePath(event.target.value)} />
        <button onClick={importMarkdown} disabled={!filePath.trim()}>
          导入 Markdown
        </button>
        <button onClick={importEpub} disabled={!filePath.trim()}>导入 EPUB</button>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="book-list">
        {books.map((book) => (
          <div className="book-item" key={book.id}>
            <button onClick={() => onOpenBook(book.id)}><strong>{book.title}</strong></button>
            <span>{book.format} · {book.tokenEstimate} tokens 估算 · {book.defaultContextStrategy}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

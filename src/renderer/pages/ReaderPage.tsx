import { useEffect, useMemo, useState } from 'react';
import type { BookDocument, ReadingThread, ThreadMessage } from '../../shared/types';
import { RightAiPanel } from '../components/RightAiPanel';
import { SelectionMenu } from '../components/SelectionMenu';
import { whisper } from '../api/whisper';

interface ReaderPageProps {
  bookId: string;
  onBack: () => void;
}

export function ReaderPage({ bookId, onBack }: ReaderPageProps) {
  const [document, setDocument] = useState<BookDocument | null>(null);
  const [selectedText, setSelectedText] = useState('');
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [threads, setThreads] = useState<Array<{ thread: ReadingThread; messages: ThreadMessage[] }>>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    void whisper.books.open(bookId).then(setDocument);
  }, [bookId]);

  const passageId = useMemo(() => {
    if (!document || !selectedText) return null;
    return document.passages.find((passage) => passage.text.includes(selectedText))?.id ?? null;
  }, [document, selectedText]);

  function updateSelection() {
    setSelectedText(window.getSelection()?.toString() ?? '');
  }

  async function explain() {
    if (!document || !selectedText.trim()) return;
    try {
      setError('');
      const result = await whisper.ai.runReadingAction({
        bookId: document.book.id,
        selectedText,
        passageId,
        actionType: 'plain_explanation',
        contextStrategy: 'full_book',
      });
      setThreads((current) => [...current, result]);
      setActiveThreadId(result.thread.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function followUp(threadId: string, question: string) {
    const result = await whisper.ai.followUp({ threadId, question });
    setThreads((current) => current.map((item) => (item.thread.id === threadId ? result : item)));
  }

  if (!document) return <p className="app-shell">正在打开书籍...</p>;

  return (
    <section className="reader-layout">
      <nav className="left-nav">
        <button onClick={onBack}>返回书库</button>
        <h2>{document.book.title}</h2>
        {document.chapters.map((chapter) => (
          <a key={chapter.id} href={`#${chapter.startPassageId}`}>
            {chapter.title}
          </a>
        ))}
      </nav>
      <article className="reader" onMouseUp={updateSelection} onKeyUp={updateSelection}>
        <SelectionMenu selectedText={selectedText} onExplain={explain} />
        {error && <p className="error">{error}</p>}
        {document.passages.map((passage) => (
          <p id={passage.id} key={passage.id}>
            {passage.text}
          </p>
        ))}
      </article>
      <RightAiPanel
        threads={threads}
        activeThreadId={activeThreadId}
        onSelectThread={setActiveThreadId}
        onFollowUp={followUp}
      />
    </section>
  );
}

import { useEffect, useMemo, useState } from 'react';
import type { AiStreamEvent, BookDocument, ReadingThread, ThreadMessage } from '../../shared/types';
import { RightAiPanel } from '../components/RightAiPanel';
import { SelectionMenu } from '../components/SelectionMenu';
import { whisper } from '../api/whisper';

interface ReaderPageProps {
  bookId: string;
  onBack: () => void;
}

type ThreadItem = { thread: ReadingThread; messages: ThreadMessage[] };

export function ReaderPage({ bookId, onBack }: ReaderPageProps) {
  const [document, setDocument] = useState<BookDocument | null>(null);
  const [selectedText, setSelectedText] = useState('');
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [threads, setThreads] = useState<ThreadItem[]>([]);
  const [error, setError] = useState('');
  const [streamError, setStreamError] = useState('');

  useEffect(() => {
    void whisper.books.open(bookId).then(setDocument);
  }, [bookId]);

  useEffect(() => {
    return whisper.ai.onStream((event: AiStreamEvent) => {
      if (event.type === 'started') {
        setStreamError('');
        setThreads((current) => upsertThread(current, event.thread, event.messages));
        setActiveThreadId(event.thread.id);
        return;
      }

      if (event.type === 'chunk') {
        setThreads((current) =>
          current.map((item) => {
            if (item.thread.id !== event.threadId) return item;
            return {
              ...item,
              thread: { ...item.thread, status: 'streaming' },
              messages: item.messages.map((message) =>
                message.id === event.messageId
                  ? { ...message, content: message.content + event.chunk }
                  : message,
              ),
            };
          }),
        );
        return;
      }

      if (event.type === 'done') {
        setThreads((current) => upsertThread(current, event.thread, event.messages));
        return;
      }

      if (event.type === 'error') {
        setStreamError(event.message);
        setThreads((current) =>
          current.map((item) =>
            item.thread.id === event.threadId
              ? { ...item, thread: { ...item.thread, status: 'failed' } }
              : item,
          ),
        );
      }
    });
  }, []);

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
      setStreamError('');
      await whisper.ai.runReadingAction({
        bookId: document.book.id,
        selectedText,
        passageId,
        actionType: 'plain_explanation',
        contextStrategy: 'full_book',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function followUp(threadId: string, question: string) {
    setStreamError('');
    await whisper.ai.followUp({ threadId, question });
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
        streamError={streamError}
      />
    </section>
  );
}

function upsertThread(current: ThreadItem[], thread: ReadingThread, messages: ThreadMessage[]): ThreadItem[] {
  const next = { thread, messages };
  const index = current.findIndex((item) => item.thread.id === thread.id);
  if (index < 0) return [...current, next];
  return current.map((item, i) => (i === index ? next : item));
}

import { useEffect, useRef, useState } from 'react';
import type { AiStreamEvent, BookDocument, CreateConversationInput, MessageReference, ReadingTarget, ReadingThread, ThreadMessage } from '../../shared/types';
import { createBookDraft, applyAutomaticSelection, replaceDraftFromSelection, selectTarget, type ConversationDraft } from '../chat/draftState';
import { RightAiPanel, type AiPanelView } from '../components/RightAiPanel';
import { SelectionMenu } from '../components/SelectionMenu';
import { captureSelection, locateSnapshot } from '../selection/selectionSnapshot';
import { whisper } from '../api/whisper';

interface ReaderPageProps { bookId: string; onBack: () => void }
type ThreadItem = { thread: ReadingThread; messages: ThreadMessage[] };

export function ReaderPage({ bookId, onBack }: ReaderPageProps) {
  const [document, setDocument] = useState<BookDocument | null>(null);
  const [threads, setThreads] = useState<ThreadItem[]>([]);
  const [openThreadIds, setOpenThreadIds] = useState<string[]>([]);
  const [activeView, setActiveView] = useState<AiPanelView>(null);
  const [draft, setDraft] = useState<ConversationDraft | null>(null);
  const [selection, setSelection] = useState<ReadingTarget | null>(null);
  const [pendingReference, setPendingReference] = useState<MessageReference | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const articleRef = useRef<HTMLElement>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const highlightedPassage = useRef<HTMLElement | null>(null);
  const highlightedRange = useRef<Range | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const doc = await whisper.books.open(bookId);
        const history = await whisper.threads.listWithMessagesByBook(bookId);
        if (cancelled) return;
        setDocument(doc); setThreads(history.threads);
        const known = new Set(history.threads.map((item) => item.thread.id));
        const saved = readOpenThreads(bookId);
        const defaultThreadId = history.activeThreadId && known.has(history.activeThreadId)
          ? history.activeThreadId
          : history.threads[0]?.thread.id;
        const defaults = defaultThreadId ? [defaultThreadId] : [];
        const stored = (saved ?? defaults).filter((id) => known.has(id));
        setOpenThreadIds(stored);
        const initial = history.activeThreadId && stored.includes(history.activeThreadId) ? history.activeThreadId : stored[0];
        setActiveView(initial ? { type: 'thread', threadId: initial } : null);
        setDraft(createBookDraft(bookId, doc.book.defaultContextStrategy));
      } catch (reason) { if (!cancelled) setError(messageOf(reason)); }
    })();
    return () => { cancelled = true; };
  }, [bookId]);

  useEffect(() => { if (document) localStorage.setItem(openThreadsKey(bookId), JSON.stringify(openThreadIds)); }, [bookId, document, openThreadIds]);
  useEffect(() => whisper.ai.onStream((event) => updateFromStream(event, setThreads)), []);
  useEffect(() => () => clearSourceHighlight(), []);

  function clearSourceHighlight() {
    if (highlightTimer.current) { clearTimeout(highlightTimer.current); highlightTimer.current = null; }
    highlightedPassage.current?.classList.remove('temporary-source-highlight');
    highlightedPassage.current = null;
    const createdRange = highlightedRange.current;
    const browserSelection = window.getSelection();
    if (createdRange && browserSelection?.rangeCount === 1 && rangesEqual(browserSelection.getRangeAt(0), createdRange)) browserSelection.removeAllRanges();
    highlightedRange.current = null;
  }

  function selectThread(threadId: string) {
    setPendingReference(null);
    setActiveView({ type: 'thread', threadId });
    void whisper.books.setActiveThread({ bookId, threadId }).catch(() => undefined);
  }
  function openThread(threadId: string) {
    setOpenThreadIds((ids) => ids.includes(threadId) ? ids : [...ids, threadId]);
    selectThread(threadId);
  }
  function openDraft() {
    if (document) setDraft(createBookDraft(bookId, document.book.defaultContextStrategy));
    setPendingReference(null); setActiveView({ type: 'draft' });
  }
  async function createConversation(input: CreateConversationInput) {
    try {
      const result = await whisper.ai.createConversation(input);
      setThreads((items) => upsertThread(items, result.thread, result.messages));
      setOpenThreadIds((ids) => ids.includes(result.thread.id) ? ids : [...ids, result.thread.id]);
      selectThread(result.thread.id);
    } catch (reason) { setError(messageOf(reason)); }
  }
  function closeThread(threadId: string) {
    setPendingReference(null);
    setOpenThreadIds((ids) => {
      const index = ids.indexOf(threadId);
      const next = ids.filter((id) => id !== threadId);
      if (activeView?.type === 'thread' && activeView.threadId === threadId) {
        const neighbor = next[Math.min(index, next.length - 1)];
        setActiveView(neighbor ? { type: 'thread', threadId: neighbor } : null);
        if (neighbor) void whisper.books.setActiveThread({ bookId, threadId: neighbor }).catch(() => undefined);
      }
      return next;
    });
  }
  async function deleteThread(threadId: string) {
    await whisper.threads.delete({ threadId });
    setThreads((items) => items.filter((item) => item.thread.id !== threadId));
    closeThread(threadId);
  }
  async function followUp(threadId: string, question: string, reference: MessageReference | null) {
    const result = await whisper.ai.followUp({ threadId, question, reference });
    setThreads((items) => upsertThread(items, result.thread, result.messages));
  }
  async function retryMessage(threadId: string, messageId: string) {
    const result = await whisper.ai.retry({ threadId, messageId });
    setThreads((items) => upsertThread(items, result.thread, result.messages));
  }
  function updateSelection() {
    if (!document) return;
    const selected = window.getSelection();
    const next = selected ? captureSelection(selected, document.chapters, document.passages) : null;
    if (!next) return;
    setSelection(next);
    if (activeView?.type === 'draft') setDraft((current) => current ? applyAutomaticSelection(current, next) : current);
  }
  function startFromSelection() {
    if (!selection || !document || !draft) return;
    setDraft(replaceDraftFromSelection(draft, selection, document.book.defaultContextStrategy));
    setPendingReference(null); setActiveView({ type: 'draft' });
  }
  function referenceSelection() {
    if (!selection) return;
    setPendingReference({ selectedText: selection.selectedText, startPassageId: selection.startPassageId!, endPassageId: selection.endPassageId!, startOffset: selection.startOffset!, endOffset: selection.endOffset!, breadcrumb: selection.breadcrumb });
  }
  function locate(threadId: string, reference?: MessageReference | null) {
    clearSourceHighlight();
    const item = threads.find(({ thread }) => thread.id === threadId);
    const snapshot = reference ?? item?.thread.target;
    if (!snapshot || !articleRef.current) return;
    const range = locateSnapshot(snapshot as ReadingTarget, articleRef.current);
    const passage = snapshot.startPassageId
      ? [...articleRef.current.querySelectorAll<HTMLElement>('[data-passage-id]')].find((element) => element.dataset.passageId === snapshot.startPassageId) ?? null
      : articleRef.current.querySelector<HTMLElement>('[data-passage-id]');
    const exact = Boolean(range && (!snapshot.selectedText || range.toString() === snapshot.selectedText));
    const anchor = exact ? (range!.startContainer.parentElement?.closest<HTMLElement>('[data-passage-id]') ?? passage) : passage;
    if (!anchor) { setNotice('无法恢复原文位置。'); return; }
    anchor.scrollIntoView({ block: 'center' });
    const browserSelection = window.getSelection();
    if (exact && browserSelection) {
      browserSelection.removeAllRanges(); browserSelection.addRange(range!); highlightedRange.current = range; setNotice('');
    } else {
      anchor.classList.add('temporary-source-highlight'); highlightedPassage.current = anchor; setNotice('无法恢复精确选区，已定位到相关段落。');
    }
    highlightTimer.current = setTimeout(clearSourceHighlight, 2000);
  }

  if (!document || !draft) return <main className="app-shell">{error ? <><p className="error">{error}</p><button onClick={onBack}>返回书库</button></> : '正在打开书籍...'}</main>;
  const activeThread = activeView?.type === 'thread' ? threads.find((item) => item.thread.id === activeView.threadId) : null;
  const streamError = activeThread?.messages.find((message) => message.status === 'failed')?.error ?? activeThread?.thread.lastError ?? undefined;
  return <section className="reader-layout">
    <nav className="left-nav"><button onClick={onBack}>返回书库</button><h2>{document.book.title}</h2>{document.chapters.map((chapter) => <a key={chapter.id} href={`#${chapter.startPassageId}`}>{chapter.title}</a>)}</nav>
    <article ref={articleRef} className="reader" onMouseUp={updateSelection} onKeyUp={updateSelection}>
      {activeView?.type === 'draft' || activeView?.type === 'thread' ? <SelectionMenu selectedText={selection?.selectedText ?? ''} mode={activeView.type} onSetTarget={() => selection && setDraft((current) => current ? applyAutomaticSelection(current, selection) : current)} onStartConversation={startFromSelection} onReference={referenceSelection} /> : null}
      {error ? <p className="error">{error}</p> : null}{notice ? <p role="status">{notice}</p> : null}
      {document.passages.map((passage) => <p id={passage.id} data-passage-id={passage.id} key={passage.id}>{passage.text}</p>)}
    </article>
    <RightAiPanel threads={threads} historyThreads={threads.map(({ thread }) => thread)} openThreadIds={openThreadIds} activeView={activeView} draft={draft} pendingReference={pendingReference}
      onOpenDraft={openDraft} onUpdateDraft={setDraft} onSelectDraftTarget={(target) => setDraft((current) => current ? selectTarget(current, target) : current)} onCreate={createConversation} onSelectThread={selectThread} onCloseThread={closeThread} onOpenHistory={() => { setPendingReference(null); setActiveView({ type: 'history' }); }}
      onOpenThread={openThread} onDeleteThread={(id) => void deleteThread(id)} onRetryThread={(id) => { const failed = threads.find((item) => item.thread.id === id)?.messages.find((message) => message.role === 'assistant' && message.status === 'failed'); if (failed) void retryMessage(id, failed.id); }}
      onFollowUp={followUp} onClearReference={() => setPendingReference(null)} onRetryMessage={(id, messageId) => void retryMessage(id, messageId)} onLocate={locate} retryableThreadIds={new Set(threads.filter((item) => item.messages.some((message) => message.role === 'assistant' && message.status === 'failed')).map((item) => item.thread.id))} streamError={streamError} />
  </section>;
}

function updateFromStream(event: AiStreamEvent, setThreads: React.Dispatch<React.SetStateAction<ThreadItem[]>>) {
  if (event.type === 'started' || event.type === 'done') { setThreads((items) => upsertThread(items, event.thread, event.messages)); return; }
  setThreads((items) => items.map((item) => item.thread.id !== event.threadId ? item : event.type === 'chunk'
    ? { ...item, thread: { ...item.thread, status: 'streaming' }, messages: item.messages.map((message) => message.id === event.messageId ? { ...message, content: message.content + event.chunk, status: 'streaming' } : message) }
    : { ...item, thread: { ...item.thread, status: 'failed', lastError: event.message }, messages: item.messages.map((message) => message.id === event.messageId ? { ...message, status: 'failed', error: event.message } : message) }));
}
function upsertThread(items: ThreadItem[], thread: ReadingThread, messages: ThreadMessage[]) { const next = { thread, messages }; return items.some((item) => item.thread.id === thread.id) ? items.map((item) => item.thread.id === thread.id ? next : item) : [...items, next]; }
function openThreadsKey(bookId: string) { return `whisper.openThreads.${bookId}`; }
function readOpenThreads(bookId: string): string[] | null { try { const raw = localStorage.getItem(openThreadsKey(bookId)); if (raw === null) return null; const value = JSON.parse(raw); return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []; } catch { return []; } }
function messageOf(reason: unknown) { return reason instanceof Error ? reason.message : String(reason); }
function rangesEqual(left: Range, right: Range) { return left.startContainer === right.startContainer && left.startOffset === right.startOffset && left.endContainer === right.endContainer && left.endOffset === right.endOffset; }

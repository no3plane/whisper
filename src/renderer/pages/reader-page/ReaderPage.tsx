import { useEffect, useRef, useState } from 'react';
import type { BookDocument, MessageReference, ReadingTarget } from '../../../shared/types';
import {
  createBookDraft,
  applyAutomaticSelection,
  replaceDraftFromSelection,
  selectTarget,
  type ConversationDraft,
} from '../../features/conversation/draftState';
import { RightAiPanel } from '../../features/conversation/RightAiPanel';
import { useConversationWorkspace } from '../../features/conversation/useConversationWorkspace';
import { SelectionMenu } from '../../features/reading-selection/SelectionMenu';
import { captureSelection } from '../../features/reading-selection/selectionSnapshot';
import { useSourceLocator } from '../../features/reading-selection/useSourceLocator';
import { whisper } from '../../api/whisper';
import appStyles from '../../App.module.css';
import styles from './ReaderPage.module.css';

interface ReaderPageProps {
  bookId: string;
  onBack: () => void;
}
export function ReaderPage({ bookId, onBack }: ReaderPageProps) {
  const [document, setDocument] = useState<BookDocument | null>(null);
  const [draft, setDraft] = useState<ConversationDraft | null>(null);
  const [selection, setSelection] = useState<ReadingTarget | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const conversation = useConversationWorkspace(bookId, setError);
  const { threads, activeView } = conversation.workspace;
  const articleRef = useRef<HTMLElement>(null);
  const locateSource = useSourceLocator(articleRef, styles.temporarySourceHighlight, setNotice);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const doc = await whisper.books.open(bookId);
        if (cancelled) {
          return;
        }
        setDocument(doc);
        setDraft(createBookDraft(bookId, doc.book.defaultContextStrategy));
      } catch (reason) {
        if (!cancelled) {
          setError(messageOf(reason));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  function openDraft() {
    if (document) {
      setDraft(createBookDraft(bookId, document.book.defaultContextStrategy));
    }
    conversation.commands.selectView({ type: 'draft' });
  }
  function updateSelection() {
    if (!document) {
      return;
    }
    const selected = window.getSelection();
    const next = selected ? captureSelection(selected, document.chapters, document.passages) : null;
    if (!next) {
      return;
    }
    setSelection(next);
    if (activeView?.type === 'draft') {
      setDraft((current) => (current ? applyAutomaticSelection(current, next) : current));
    }
  }
  function startFromSelection() {
    if (!selection || !document || !draft) {
      return;
    }
    setDraft(replaceDraftFromSelection(draft, selection, document.book.defaultContextStrategy));
    conversation.commands.selectView({ type: 'draft' });
  }
  function referenceSelection() {
    if (!selection) {
      return;
    }
    conversation.commands.setReference({
      selectedText: selection.selectedText,
      startPassageId: selection.startPassageId!,
      endPassageId: selection.endPassageId!,
      startOffset: selection.startOffset!,
      endOffset: selection.endOffset!,
      breadcrumb: selection.breadcrumb,
    });
  }
  function locate(threadId: string, reference?: MessageReference | null) {
    const item = threads.find(({ thread }) => thread.id === threadId);
    const snapshot = reference ?? item?.thread.target;
    if (snapshot) {
      locateSource(snapshot);
    }
  }

  if (!document || !draft) {
    return (
      <main className={appStyles.shell}>
        {error ? (
          <>
            <p className="error">{error}</p>
            <button onClick={onBack}>返回书库</button>
          </>
        ) : (
          '正在打开书籍...'
        )}
      </main>
    );
  }
  return (
    <section className={styles.layout}>
      <nav className={styles.leftNav}>
        <button onClick={onBack}>返回书库</button>
        <h2>{document.book.title}</h2>
        {document.chapters.map((chapter) => (
          <a key={chapter.id} href={`#${chapter.startPassageId}`}>
            {chapter.title}
          </a>
        ))}
      </nav>
      <article
        ref={articleRef}
        className={styles.reader}
        onMouseUp={updateSelection}
        onKeyUp={updateSelection}
      >
        {activeView?.type === 'draft' || activeView?.type === 'thread' ? (
          <SelectionMenu
            selectedText={selection?.selectedText ?? ''}
            mode={activeView.type}
            onSetTarget={() =>
              selection &&
              setDraft((current) =>
                current ? applyAutomaticSelection(current, selection) : current,
              )
            }
            onStartConversation={startFromSelection}
            onReference={referenceSelection}
          />
        ) : null}
        {error ? <p className="error">{error}</p> : null}
        {notice ? <p role="status">{notice}</p> : null}
        {document.passages.map((passage) => (
          <p id={passage.id} data-passage-id={passage.id} key={passage.id}>
            {passage.text}
          </p>
        ))}
      </article>
      <RightAiPanel
        conversation={conversation}
        draft={{
          value: draft,
          open: openDraft,
          update: setDraft,
          selectTarget: (target) =>
            setDraft((current) => (current ? selectTarget(current, target) : current)),
        }}
        onLocate={locate}
      />
    </section>
  );
}
function messageOf(reason: unknown) {
  return reason instanceof Error ? reason.message : String(reason);
}

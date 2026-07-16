import { useEffect, useMemo, useRef, useState } from 'react';
import type { BookDocument, Chapter, MessageReference, ReadingTarget } from '../../../shared/types';
import { BookOutline } from '../../features/book-outline/BookOutline';
import { buildOutlineModel } from '../../features/book-outline/outlineModel';
import { useReadingPosition } from '../../features/book-outline/useReadingPosition';
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
import { createSelectionTargetFromDOMSelection } from '../../features/reading-selection/renderedTextSelection';
import { useReadingTargetNavigation } from '../../features/reading-selection/useReadingTargetNavigation';
import { whisper } from '../../api/whisper';
import { MarkdownDocument } from '../../features/markdown-reading/MarkdownDocument';
import styles from './ReaderPage.module.css';

interface ReaderPageProps {
  bookId: string;
  onBack: () => void;
}
export function ReaderPage({ bookId, onBack }: ReaderPageProps) {
  const [document, setDocument] = useState<BookDocument | null>(null);
  const [draft, setDraft] = useState<ConversationDraft | null>(null);
  const [selection, setSelection] = useState<ReadingTarget | null>(null);
  const [navigationChapterId, setNavigationChapterId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const conversation = useConversationWorkspace(bookId, setError);
  const { threads, activeView } = conversation.workspace;
  const articleRef = useRef<HTMLElement>(null);
  const readerStageRef = useRef<HTMLElement>(null);
  const outlineModel = useMemo(() => buildOutlineModel(document?.chapters ?? []), [document]);
  const activeChapterId = useReadingPosition(readerStageRef, document?.blocks ?? []);
  const navigateToReadingTarget = useReadingTargetNavigation(
    articleRef,
    styles.temporaryReadingTargetHighlight,
    setNotice,
  );

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

  useEffect(() => {
    const readerStage = readerStageRef.current;
    if (!readerStage || !navigationChapterId) {
      return;
    }

    const finishNavigation = () => setNavigationChapterId(null);
    readerStage.addEventListener('scrollend', finishNavigation, { once: true });
    return () => {
      readerStage.removeEventListener('scrollend', finishNavigation);
    };
  }, [navigationChapterId]);

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
    const browserSelection = window.getSelection();
    const selectionTarget = browserSelection
      ? createSelectionTargetFromDOMSelection(browserSelection, document.chapters, document.blocks)
      : null;
    if (!selectionTarget) {
      return;
    }
    setSelection(selectionTarget);
    if (activeView?.type === 'draft') {
      setDraft((current) =>
        current ? applyAutomaticSelection(current, selectionTarget) : current,
      );
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
      start: selection.start!,
      end: selection.end!,
      breadcrumb: selection.breadcrumb,
    });
  }
  function navigateToConversationTarget(threadId: string, reference?: MessageReference | null) {
    const item = threads.find(({ thread }) => thread.id === threadId);
    const targetToReveal = reference ?? item?.thread.target;
    if (targetToReveal) {
      navigateToReadingTarget(targetToReveal);
    }
  }
  function navigateToChapter(chapter: Chapter) {
    setNavigationChapterId(chapter.id);
    globalThis.document.getElementById(chapter.headingBlockId)?.scrollIntoView({
      behavior: 'instant',
      block: 'start',
    });
  }

  if (!document || !draft) {
    return (
      <main className={styles.loadingShell} aria-busy={!error}>
        {error ? (
          <div className={styles.loadingPaper}>
            <p role="alert" className="error">
              {error}
            </p>
            <button className={styles.backButton} onClick={onBack}>
              返回书库
            </button>
          </div>
        ) : (
          <div className={styles.loadingPaper}>
            <p role="status">正在打开书籍…</p>
          </div>
        )}
      </main>
    );
  }
  return (
    <section className={styles.layout}>
      <nav className={styles.leftNav} aria-label="书籍目录">
        <button className={styles.backButton} onClick={onBack}>
          返回书库
        </button>
        <div className={styles.chapterList}>
          <BookOutline
            model={outlineModel}
            activeChapterId={navigationChapterId ?? activeChapterId}
            onNavigate={navigateToChapter}
          />
        </div>
      </nav>
      <main ref={readerStageRef} className={styles.readerStage}>
        <article
          ref={articleRef}
          className={styles.readerPaper}
          aria-label="阅读正文"
          onMouseUp={updateSelection}
          onKeyUp={updateSelection}
        >
          <header className={styles.readerHeader}>
            <span>WHISPER READING</span>
            <h1>{document.book.title}</h1>
          </header>
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
          <MarkdownDocument
            markdown={document.markdown}
            blocks={document.blocks}
            resources={document.resources}
          />
        </article>
      </main>
      <RightAiPanel
        conversation={conversation}
        draft={{
          value: draft,
          open: openDraft,
          update: setDraft,
          selectTarget: (target) =>
            setDraft((current) => (current ? selectTarget(current, target) : current)),
        }}
        onLocate={navigateToConversationTarget}
      />
    </section>
  );
}
function messageOf(reason: unknown) {
  return reason instanceof Error ? reason.message : String(reason);
}

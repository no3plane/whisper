import { useEffect, useMemo, useRef, useState } from 'react';
import type { BookDocument, Chapter, MessageReference } from '../../../shared/types';
import { BookOutline } from '../../features/book-outline/BookOutline';
import { buildOutlineModel } from '../../features/book-outline/outlineModel';
import { useReadingPosition } from '../../features/book-outline/useReadingPosition';
import {
  createBookDraft,
  replaceDraftFromSelection,
  selectTarget,
  type ConversationDraft,
} from '../../features/conversation/draftState';
import { RightAiPanel } from '../../features/conversation/RightAiPanel';
import { useConversationWorkspace } from '../../features/conversation/useConversationWorkspace';
import { SelectionMenu } from '../../features/reading-selection/SelectionMenu';
import { useReadingTargetNavigation } from '../../features/reading-selection/useReadingTargetNavigation';
import { useReadingSelection } from '../../features/reading-selection/useReadingSelection';
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
  const [navigationChapterId, setNavigationChapterId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const conversation = useConversationWorkspace(bookId, setError);
  const { threads } = conversation.workspace;
  const articleElRef = useRef<HTMLElement>(null);
  const scrollElRef = useRef<HTMLElement>(null);
  const outlineModel = useMemo(() => buildOutlineModel(document?.chapters ?? []), [document]);
  const activeChapterId = useReadingPosition(scrollElRef, document?.blocks ?? []);
  const { navigateToReadingTarget, isRevealedSelection } = useReadingTargetNavigation(
    articleElRef,
    styles.temporaryReadingTargetHighlight,
    setNotice,
  );
  const readingSelection = useReadingSelection({
    document,
    articleElRef,
    scrollElRef,
    isRevealedSelection,
  });

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
    const readerStage = scrollElRef.current;
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
  function startFromSelection() {
    if (!readingSelection.target || !document || !draft) {
      return;
    }
    setDraft(
      replaceDraftFromSelection(
        draft,
        readingSelection.target,
        document.book.defaultContextStrategy,
      ),
    );
    readingSelection.dismissMenu();
    conversation.commands.selectView({ type: 'draft' });
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
      <main ref={scrollElRef} className={styles.readerStage}>
        <article ref={articleElRef} className={styles.readerPaper} aria-label="阅读正文">
          <header className={styles.readerHeader}>
            <span>WHISPER READING</span>
            <h1>{document.book.title}</h1>
          </header>
          {readingSelection.target && readingSelection.menuPosition ? (
            <SelectionMenu
              selectedText={readingSelection.target.selectedText}
              position={readingSelection.menuPosition}
              onAsk={startFromSelection}
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

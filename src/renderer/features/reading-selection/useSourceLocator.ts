import { useCallback, useEffect, useRef, type RefObject } from 'react';
import type { MessageReference, ReadingTarget } from '../../../shared/types';
import { locateSnapshot } from './selectionSnapshot';

export function useSourceLocator(
  articleRef: RefObject<HTMLElement | null>,
  temporaryHighlightClass: string,
  onNotice: (notice: string) => void,
) {
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const highlightedBlock = useRef<HTMLElement | null>(null);
  const highlightedRange = useRef<Range | null>(null);

  const clear = useCallback(() => {
    if (highlightTimer.current) {
      clearTimeout(highlightTimer.current);
    }
    highlightTimer.current = null;
    highlightedBlock.current?.classList.remove(temporaryHighlightClass);
    highlightedBlock.current = null;
    const createdRange = highlightedRange.current;
    const browserSelection = window.getSelection();
    if (
      createdRange &&
      browserSelection?.rangeCount === 1 &&
      rangesEqual(browserSelection.getRangeAt(0), createdRange)
    ) {
      browserSelection.removeAllRanges();
    }
    highlightedRange.current = null;
  }, [temporaryHighlightClass]);

  useEffect(() => clear, [clear]);

  const locate = useCallback(
    (snapshot: ReadingTarget | MessageReference) => {
      clear();
      const article = articleRef.current;
      if (!article) {
        return;
      }
      const range = locateSnapshot(snapshot as ReadingTarget, article);
      const block = snapshot.start
        ? ([...article.querySelectorAll<HTMLElement>('[data-block-id]')].find(
            (element) => element.dataset.blockId === snapshot.start?.blockId,
          ) ?? null)
        : article.querySelector<HTMLElement>('[data-block-id]');
      const exact = Boolean(
        range && (!snapshot.selectedText || range.toString() === snapshot.selectedText),
      );
      const anchor = exact
        ? (range!.startContainer.parentElement?.closest<HTMLElement>('[data-block-id]') ?? block)
        : block;
      if (!anchor) {
        onNotice('无法恢复原文位置。');
        return;
      }
      anchor.scrollIntoView({ block: 'center' });
      const browserSelection = window.getSelection();
      if (exact && browserSelection) {
        browserSelection.removeAllRanges();
        browserSelection.addRange(range!);
        highlightedRange.current = range;
        onNotice('');
      } else {
        anchor.classList.add(temporaryHighlightClass);
        highlightedBlock.current = anchor;
        onNotice('无法恢复精确选区，已定位到相关段落。');
      }
      highlightTimer.current = setTimeout(clear, 2000);
    },
    [articleRef, clear, onNotice, temporaryHighlightClass],
  );

  return locate;
}

function rangesEqual(left: Range, right: Range) {
  return (
    left.startContainer === right.startContainer &&
    left.startOffset === right.startOffset &&
    left.endContainer === right.endContainer &&
    left.endOffset === right.endOffset
  );
}

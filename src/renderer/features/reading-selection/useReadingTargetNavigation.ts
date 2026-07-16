import { useCallback, useEffect, useRef, type RefObject } from 'react';
import type { MessageReference, ReadingTarget } from '../../../shared/types';
import { renderedTextSelectionToDOMRange } from './renderedTextSelection';

export function useReadingTargetNavigation(
  articleRef: RefObject<HTMLElement | null>,
  temporaryHighlightClass: string,
  onNotice: (notice: string) => void,
) {
  const highlightClearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revealedBlockElement = useRef<HTMLElement | null>(null);
  const revealedDOMRange = useRef<Range | null>(null);

  const clearRevealedTarget = useCallback(() => {
    if (highlightClearTimer.current) {
      clearTimeout(highlightClearTimer.current);
    }
    highlightClearTimer.current = null;
    revealedBlockElement.current?.classList.remove(temporaryHighlightClass);
    revealedBlockElement.current = null;
    const rangeToClear = revealedDOMRange.current;
    const browserSelection = window.getSelection();
    if (
      rangeToClear &&
      browserSelection?.rangeCount === 1 &&
      rangesEqual(browserSelection.getRangeAt(0), rangeToClear)
    ) {
      browserSelection.removeAllRanges();
    }
    revealedDOMRange.current = null;
  }, [temporaryHighlightClass]);

  useEffect(() => clearRevealedTarget, [clearRevealedTarget]);

  const isRevealedSelection = useCallback((selection: Selection | null) => {
    const revealedRange = revealedDOMRange.current;
    return Boolean(
      revealedRange &&
      selection?.rangeCount === 1 &&
      rangesEqual(selection.getRangeAt(0), revealedRange),
    );
  }, []);

  const navigateToReadingTarget = useCallback(
    (target: ReadingTarget | MessageReference) => {
      clearRevealedTarget();
      const article = articleRef.current;
      if (!article) {
        return;
      }
      const range = renderedTextSelectionToDOMRange(target, article);
      const block = target.start
        ? ([...article.querySelectorAll<HTMLElement>('[data-block-id]')].find(
            (element) => element.dataset.blockId === target.start?.blockId,
          ) ?? null)
        : article.querySelector<HTMLElement>('[data-block-id]');
      const hasExactDOMRange = Boolean(
        range && (!target.selectedText || range.toString() === target.selectedText),
      );
      const scrollTargetElement = hasExactDOMRange
        ? (range!.startContainer.parentElement?.closest<HTMLElement>('[data-block-id]') ?? block)
        : block;
      if (!scrollTargetElement) {
        onNotice('无法恢复原文位置。');
        return;
      }
      scrollTargetElement.scrollIntoView({ block: 'center' });
      const browserSelection = window.getSelection();
      if (hasExactDOMRange && browserSelection) {
        browserSelection.removeAllRanges();
        browserSelection.addRange(range!);
        revealedDOMRange.current = range;
        onNotice('');
      } else {
        scrollTargetElement.classList.add(temporaryHighlightClass);
        revealedBlockElement.current = scrollTargetElement;
        onNotice('无法恢复精确选区，已定位到相关段落。');
      }
      highlightClearTimer.current = setTimeout(clearRevealedTarget, 2000);
    },
    [articleRef, clearRevealedTarget, onNotice, temporaryHighlightClass],
  );

  return { navigateToReadingTarget, isRevealedSelection };
}

function rangesEqual(left: Range, right: Range) {
  return (
    left.startContainer === right.startContainer &&
    left.startOffset === right.startOffset &&
    left.endContainer === right.endContainer &&
    left.endOffset === right.endOffset
  );
}

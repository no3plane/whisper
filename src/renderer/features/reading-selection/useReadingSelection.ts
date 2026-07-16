import { useEffect, useRef, useState, type RefObject } from 'react';
import type { BookDocument, ReadingTarget } from '../../../shared/types';
import { createSelectionTargetFromDOMSelection } from './renderedTextSelection';

interface SelectionMenuPosition {
  left: number;
  top: number;
}

interface UseReadingSelectionInput {
  document: BookDocument | null;
  articleElRef: RefObject<HTMLElement | null>;
  scrollElRef: RefObject<HTMLElement | null>;
  isRevealedSelection: (selection: Selection | null) => boolean;
}

export function useReadingSelection({
  document,
  articleElRef,
  scrollElRef,
  isRevealedSelection,
}: UseReadingSelectionInput) {
  const [target, setTarget] = useState<ReadingTarget | null>(null);
  const [menuPosition, setMenuPosition] = useState<SelectionMenuPosition | null>(null);
  // 按住正文时可能正在拖选，按钮应暂时隐藏；记录从按下到松开的操作是否仍在进行。
  const isPointerSelectingRef = useRef(false);
  // 单击旧选区时，pointerup 早于选区折叠，会让按钮闪现；
  // 记录本次按下后选区是否真的变化，只有变化过才在松开后显示按钮。
  const didPointerSelectionChangeRef = useRef(false);

  useEffect(() => {
    function clearSelection() {
      setTarget(null);
      setMenuPosition(null);
    }

    function syncSelection(showMenu: boolean) {
      if (!document) {
        return;
      }
      const browserSelection = window.getSelection();
      const article = articleElRef.current;
      if (!browserSelection || !article) {
        return;
      }
      if (browserSelection.rangeCount === 0) {
        clearSelection();
        return;
      }
      if (browserSelection.rangeCount !== 1) {
        return;
      }
      const range = browserSelection.getRangeAt(0);
      if (!article.contains(range.commonAncestorContainer)) {
        return;
      }
      if (isRevealedSelection(browserSelection)) {
        return;
      }
      const nextTarget = createSelectionTargetFromDOMSelection(
        browserSelection,
        document.chapters,
        document.blocks,
      );
      if (!nextTarget) {
        clearSelection();
        return;
      }
      setTarget(nextTarget);
      setMenuPosition(showMenu ? positionSelectionMenu(range, scrollElRef.current) : null);
    }

    const article = articleElRef.current;
    const handleSelectionChange = () => {
      if (isPointerSelectingRef.current) {
        didPointerSelectionChangeRef.current = true;
      }
      syncSelection(!isPointerSelectingRef.current);
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest('[data-selection-menu]')) {
        return;
      }
      isPointerSelectingRef.current = true;
      didPointerSelectionChangeRef.current = false;
      setMenuPosition(null);
    };
    const handlePointerUp = () => {
      if (!isPointerSelectingRef.current) {
        return;
      }
      isPointerSelectingRef.current = false;
      if (didPointerSelectionChangeRef.current) {
        syncSelection(true);
      }
    };
    const handlePointerCancel = () => {
      isPointerSelectingRef.current = false;
      didPointerSelectionChangeRef.current = false;
      setMenuPosition(null);
    };

    article?.addEventListener('pointerdown', handlePointerDown);
    globalThis.document.addEventListener('pointerup', handlePointerUp);
    globalThis.document.addEventListener('pointercancel', handlePointerCancel);
    globalThis.document.addEventListener('selectionchange', handleSelectionChange);
    return () => {
      article?.removeEventListener('pointerdown', handlePointerDown);
      globalThis.document.removeEventListener('pointerup', handlePointerUp);
      globalThis.document.removeEventListener('pointercancel', handlePointerCancel);
      globalThis.document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, [articleElRef, document, isRevealedSelection, scrollElRef]);

  return {
    target,
    menuPosition,
    dismissMenu: () => setMenuPosition(null),
  };
}

function positionSelectionMenu(range: Range, scrollElement: HTMLElement | null) {
  const rects = Array.from(range.getClientRects?.() ?? []).filter(
    (rect) => rect.width > 0 || rect.height > 0,
  );
  const selectionRect = rects.at(-1) ?? range.getBoundingClientRect?.() ?? zeroRect();
  const scrollRect = scrollElement?.getBoundingClientRect() ?? {
    left: 0,
    top: 0,
    right: globalThis.innerWidth,
    bottom: globalThis.innerHeight,
  };
  const gap = 8;
  const edge = 8;
  const menuWidth = 64;
  const menuHeight = 36;
  const minLeft = Math.max(scrollRect.left + edge, edge);
  const maxLeft = Math.min(
    scrollRect.right - menuWidth - edge,
    globalThis.innerWidth - menuWidth - edge,
  );
  const left = Math.min(Math.max(selectionRect.right + gap, minLeft), Math.max(minLeft, maxLeft));
  const below = selectionRect.bottom + gap;
  const maxTop = Math.min(
    scrollRect.bottom - menuHeight - edge,
    globalThis.innerHeight - menuHeight - edge,
  );
  const top =
    below <= maxTop ? below : Math.max(scrollRect.top + edge, selectionRect.top - menuHeight - gap);
  return { left: Math.round(left), top: Math.round(top) };
}

function zeroRect(): DOMRect {
  return {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    toJSON: () => ({}),
  };
}

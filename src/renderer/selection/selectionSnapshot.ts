import type { Chapter, ChapterCrumb, Passage, ReadingTarget } from '../../shared/types';

function passageElement(node: Node): HTMLElement | null {
  const element = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
  return element?.closest<HTMLElement>('[data-passage-id]') ?? null;
}

function textOffset(root: HTMLElement, node: Node, offset: number): number {
  const prefix = document.createRange();
  prefix.selectNodeContents(root);
  prefix.setEnd(node, offset);
  return prefix.toString().length;
}

function pointAt(root: HTMLElement, offset: number): { node: Node; offset: number } | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let remaining = offset;
  let node: Node | null;
  let last: Node | null = null;
  while ((node = walker.nextNode())) {
    last = node;
    const length = node.textContent?.length ?? 0;
    if (remaining <= length) return { node, offset: remaining };
    remaining -= length;
  }
  return remaining === 0 && last ? { node: last, offset: last.textContent?.length ?? 0 } : null;
}

function ancestry(chapterId: string | null, chapters: Chapter[]): Chapter[] {
  const byId = new Map(chapters.map((chapter) => [chapter.id, chapter]));
  const result: Chapter[] = [];
  let current = chapterId ? byId.get(chapterId) : undefined;
  while (current) {
    result.push(current);
    current = current.parentChapterId ? byId.get(current.parentChapterId) : undefined;
  }
  return result;
}

export function breadcrumbsForSelection(
  startPassageId: string,
  endPassageId: string,
  chapters: Chapter[],
  passages: Passage[],
): ChapterCrumb[] {
  const startChapterId = passages.find((passage) => passage.id === startPassageId)?.chapterId ?? null;
  const endChapterId = passages.find((passage) => passage.id === endPassageId)?.chapterId ?? null;
  const endIds = new Set(ancestry(endChapterId, chapters).map((chapter) => chapter.id));
  return ancestry(startChapterId, chapters)
    .filter((chapter) => endIds.has(chapter.id))
    .map(({ id, title }) => ({ chapterId: id, title }));
}

export function captureSelection(
  selection: Selection,
  chapters: Chapter[],
  passages: Passage[],
): ReadingTarget | null {
  if (!selection.rangeCount || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  const startElement = passageElement(range.startContainer);
  const endElement = passageElement(range.endContainer);
  if (!startElement || !endElement) return null;
  const startPassageId = startElement.dataset.passageId;
  const endPassageId = endElement.dataset.passageId;
  if (!startPassageId || !endPassageId) return null;
  const breadcrumb = breadcrumbsForSelection(startPassageId, endPassageId, chapters, passages);
  return {
    type: 'selection', chapterId: breadcrumb[0]?.chapterId ?? null,
    startPassageId, endPassageId, selectedText: selection.toString(),
    startOffset: textOffset(startElement, range.startContainer, range.startOffset),
    endOffset: textOffset(endElement, range.endContainer, range.endOffset),
    breadcrumb,
  };
}

export function locateSnapshot(snapshot: ReadingTarget, root: ParentNode): Range | null {
  if (!snapshot.startPassageId || !snapshot.endPassageId) return null;
  const elements = [...root.querySelectorAll<HTMLElement>('[data-passage-id]')];
  const start = elements.find((element) => element.dataset.passageId === snapshot.startPassageId);
  const end = elements.find((element) => element.dataset.passageId === snapshot.endPassageId);
  if (!start) return null;

  if (end && snapshot.startOffset != null && snapshot.endOffset != null) {
    const startPoint = pointAt(start, snapshot.startOffset);
    const endPoint = pointAt(end, snapshot.endOffset);
    if (startPoint && endPoint) {
      const exact = document.createRange();
      exact.setStart(startPoint.node, startPoint.offset);
      exact.setEnd(endPoint.node, endPoint.offset);
      if (!snapshot.selectedText || exact.toString() === snapshot.selectedText) return exact;
    }
  }

  const found = snapshot.selectedText ? start.textContent?.indexOf(snapshot.selectedText) ?? -1 : -1;
  if (found >= 0) {
    const from = pointAt(start, found);
    const to = pointAt(start, found + snapshot.selectedText.length);
    if (from && to) {
      const match = document.createRange();
      match.setStart(from.node, from.offset); match.setEnd(to.node, to.offset);
      return match;
    }
  }

  if (end) {
    const fallback = document.createRange();
    fallback.selectNodeContents(start);
    fallback.setEnd(end, end.childNodes.length);
    return fallback;
  }
  return null;
}

import type { Chapter, ChapterCrumb, MarkdownBlock, ReadingTarget } from '../../../shared/types';

function blockElement(node: Node): HTMLElement | null {
  const element = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  return element?.closest<HTMLElement>('[data-block-id]') ?? null;
}

function textOffset(root: HTMLElement, node: Node, offset: number): number {
  const range = document.createRange();
  range.selectNodeContents(root);
  range.setEnd(node, offset);
  return range.toString().length;
}

function pointAt(root: HTMLElement, offset: number) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let remaining = offset;
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const length = node.textContent?.length ?? 0;
    if (remaining <= length) {
      return { node, offset: remaining };
    }
    remaining -= length;
  }
  return null;
}

function ancestry(chapterId: string | null, chapters: Chapter[]) {
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
  startBlockId: string,
  endBlockId: string,
  chapters: Chapter[],
  blocks: MarkdownBlock[],
): ChapterCrumb[] {
  const startChapter = blocks.find((block) => block.id === startBlockId)?.chapterId ?? null;
  const endChapter = blocks.find((block) => block.id === endBlockId)?.chapterId ?? null;
  const endIds = new Set(ancestry(endChapter, chapters).map((chapter) => chapter.id));
  return ancestry(startChapter, chapters)
    .filter((chapter) => endIds.has(chapter.id))
    .map(({ id, title }) => ({ chapterId: id, title }));
}

export function captureSelection(
  selection: Selection,
  chapters: Chapter[],
  blocks: MarkdownBlock[],
): ReadingTarget | null {
  if (!selection.rangeCount || selection.isCollapsed) {
    return null;
  }
  const range = selection.getRangeAt(0);
  const startElement = blockElement(range.startContainer);
  const endElement = blockElement(range.endContainer);
  const startBlockId = startElement?.dataset.blockId;
  const endBlockId = endElement?.dataset.blockId;
  if (!startElement || !endElement || !startBlockId || !endBlockId) {
    return null;
  }
  const breadcrumb = breadcrumbsForSelection(startBlockId, endBlockId, chapters, blocks);
  return {
    type: 'selection',
    chapterId: breadcrumb[0]?.chapterId ?? null,
    start: {
      blockId: startBlockId,
      offset: textOffset(startElement, range.startContainer, range.startOffset),
    },
    end: {
      blockId: endBlockId,
      offset: textOffset(endElement, range.endContainer, range.endOffset),
    },
    selectedText: selection.toString(),
    breadcrumb,
  };
}

export function locateSnapshot(snapshot: ReadingTarget, root: ParentNode): Range | null {
  if (!snapshot.start || !snapshot.end) {
    return null;
  }
  const elements = [...root.querySelectorAll<HTMLElement>('[data-block-id]')];
  const start = elements.find((element) => element.dataset.blockId === snapshot.start?.blockId);
  const end = elements.find((element) => element.dataset.blockId === snapshot.end?.blockId);
  if (!start || !end) {
    return null;
  }
  const from = pointAt(start, snapshot.start.offset);
  const to = pointAt(end, snapshot.end.offset);
  if (!from || !to) {
    return null;
  }
  const range = document.createRange();
  range.setStart(from.node, from.offset);
  range.setEnd(to.node, to.offset);
  return !snapshot.selectedText || range.toString() === snapshot.selectedText ? range : null;
}

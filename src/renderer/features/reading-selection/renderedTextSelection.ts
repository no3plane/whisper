import type { Chapter, ChapterCrumb, MarkdownBlock, ReadingTarget } from '../../../shared/types';

function closestBlockElement(node: Node): HTMLElement | null {
  const element = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  return element?.closest<HTMLElement>('[data-block-id]') ?? null;
}

function offsetInBlockForDOMPoint(root: HTMLElement, node: Node, offset: number): number {
  const range = document.createRange();
  range.selectNodeContents(root);
  range.setEnd(node, offset);
  return range.toString().length;
}

function domPointAtOffsetInBlock(root: HTMLElement, offsetInBlock: number) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let remaining = offsetInBlock;
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

function chapterAncestry(chapterId: string | null, chapters: Chapter[]) {
  const byId = new Map(chapters.map((chapter) => [chapter.id, chapter]));
  const result: Chapter[] = [];
  let current = chapterId ? byId.get(chapterId) : undefined;
  while (current) {
    result.push(current);
    current = current.parentChapterId ? byId.get(current.parentChapterId) : undefined;
  }
  return result;
}

export function breadcrumbsForRenderedTextSelection(
  startBlockId: string,
  endBlockId: string,
  chapters: Chapter[],
  blocks: MarkdownBlock[],
): ChapterCrumb[] {
  const startChapter = blocks.find((block) => block.id === startBlockId)?.chapterId ?? null;
  const endChapter = blocks.find((block) => block.id === endBlockId)?.chapterId ?? null;
  const endIds = new Set(chapterAncestry(endChapter, chapters).map((chapter) => chapter.id));
  return chapterAncestry(startChapter, chapters)
    .filter((chapter) => endIds.has(chapter.id))
    .map(({ id, title }) => ({ chapterId: id, title }));
}

export function createSelectionTargetFromDOMSelection(
  selection: Selection,
  chapters: Chapter[],
  blocks: MarkdownBlock[],
): ReadingTarget | null {
  if (!selection.rangeCount || selection.isCollapsed) {
    return null;
  }
  const range = selection.getRangeAt(0);
  const startElement = closestBlockElement(range.startContainer);
  const endElement = closestBlockElement(range.endContainer);
  const startBlockId = startElement?.dataset.blockId;
  const endBlockId = endElement?.dataset.blockId;
  if (!startElement || !endElement || !startBlockId || !endBlockId) {
    return null;
  }
  const breadcrumb = breadcrumbsForRenderedTextSelection(
    startBlockId,
    endBlockId,
    chapters,
    blocks,
  );
  return {
    type: 'selection',
    chapterId: breadcrumb[0]?.chapterId ?? null,
    start: {
      blockId: startBlockId,
      offsetInBlock: offsetInBlockForDOMPoint(
        startElement,
        range.startContainer,
        range.startOffset,
      ),
    },
    end: {
      blockId: endBlockId,
      offsetInBlock: offsetInBlockForDOMPoint(endElement, range.endContainer, range.endOffset),
    },
    selectedText: selection.toString(),
    breadcrumb,
  };
}

export function renderedTextSelectionToDOMRange(
  selection: Pick<ReadingTarget, 'start' | 'end' | 'selectedText'>,
  root: ParentNode,
): Range | null {
  if (!selection.start || !selection.end) {
    return null;
  }
  const elements = [...root.querySelectorAll<HTMLElement>('[data-block-id]')];
  const start = elements.find((element) => element.dataset.blockId === selection.start?.blockId);
  const end = elements.find((element) => element.dataset.blockId === selection.end?.blockId);
  if (!start || !end) {
    return null;
  }
  const from = domPointAtOffsetInBlock(start, selection.start.offsetInBlock);
  const to = domPointAtOffsetInBlock(end, selection.end.offsetInBlock);
  if (!from || !to) {
    return null;
  }
  const range = document.createRange();
  range.setStart(from.node, from.offset);
  range.setEnd(to.node, to.offset);
  return !selection.selectedText || range.toString() === selection.selectedText ? range : null;
}

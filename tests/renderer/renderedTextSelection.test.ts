import { describe, expect, it } from 'vitest';
import type { Chapter, MarkdownBlock, ReadingTarget } from '../../src/shared/types';
import {
  breadcrumbsForRenderedTextSelection,
  createSelectionTargetFromDOMSelection,
  renderedTextSelectionToDOMRange,
} from '../../src/renderer/features/reading-selection/renderedTextSelection';

const chapters: Chapter[] = [
  {
    id: 'part',
    bookId: 'b',
    parentChapterId: null,
    headingBlockId: 'h1',
    title: '上篇',
    level: 1,
    order: 0,
    sourceStart: 0,
    sourceEnd: 100,
  },
  {
    id: 'a',
    bookId: 'b',
    parentChapterId: 'part',
    headingBlockId: 'ha',
    title: '第一节',
    level: 2,
    order: 1,
    sourceStart: 10,
    sourceEnd: 50,
  },
  {
    id: 'b',
    bookId: 'b',
    parentChapterId: 'part',
    headingBlockId: 'hb',
    title: '第二节',
    level: 2,
    order: 2,
    sourceStart: 50,
    sourceEnd: 100,
  },
];
const blocks: MarkdownBlock[] = [
  {
    id: 'p1',
    chapterId: 'a',
    order: 0,
    type: 'paragraph',
    sourceStart: 20,
    sourceEnd: 23,
    markdown: '甲乙丙',
    plainText: '甲乙丙',
  },
  {
    id: 'p2',
    chapterId: 'b',
    order: 1,
    type: 'paragraph',
    sourceStart: 60,
    sourceEnd: 63,
    markdown: '丁戊己',
    plainText: '丁戊己',
  },
];

function select(range: Range) {
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  return selection;
}

describe('renderedTextSelection', () => {
  it('把跨 block DOM 选区转换为渲染文本位置', () => {
    document.body.innerHTML =
      '<p data-block-id="p1">甲<strong>乙</strong>丙</p><p data-block-id="p2">丁戊己</p>';
    const paragraphs = document.querySelectorAll('p');
    const range = document.createRange();
    range.setStart(paragraphs[0].firstChild!, 0);
    range.setEnd(paragraphs[1].firstChild!, 2);

    expect(createSelectionTargetFromDOMSelection(select(range), chapters, blocks)).toMatchObject({
      type: 'selection',
      selectedText: '甲乙丙丁戊',
      start: { blockId: 'p1', offsetInBlock: 0 },
      end: { blockId: 'p2', offsetInBlock: 2 },
      breadcrumb: [{ chapterId: 'part', title: '上篇' }],
    });
  });

  it('跨兄弟章节返回最低共同祖先', () => {
    expect(breadcrumbsForRenderedTextSelection('p1', 'p2', chapters, blocks)).toEqual([
      { chapterId: 'part', title: '上篇' },
    ]);
  });

  it('把渲染文本位置恢复为 DOM Range，文本不一致或 block 缺失时拒绝恢复', () => {
    document.body.innerHTML =
      '<article><p data-block-id="p1">甲乙丙</p><p data-block-id="p2">丁戊己</p></article>';
    const snapshot: ReadingTarget = {
      type: 'selection',
      chapterId: 'part',
      selectedText: '乙丙丁戊',
      breadcrumb: [],
      start: { blockId: 'p1', offsetInBlock: 1 },
      end: { blockId: 'p2', offsetInBlock: 2 },
    };
    const root = document.querySelector('article')!;

    expect(renderedTextSelectionToDOMRange(snapshot, root)?.toString()).toBe('乙丙丁戊');
    expect(renderedTextSelectionToDOMRange({ ...snapshot, selectedText: '变化' }, root)).toBeNull();
    expect(
      renderedTextSelectionToDOMRange(
        { ...snapshot, end: { blockId: 'missing', offsetInBlock: 2 } },
        root,
      ),
    ).toBeNull();
  });

  it('拒绝 block 外或折叠选区', () => {
    document.body.innerHTML = '<div>甲乙</div>';
    const node = document.querySelector('div')!.firstChild!;
    const range = document.createRange();
    range.setStart(node, 0);
    range.setEnd(node, 1);
    expect(createSelectionTargetFromDOMSelection(select(range), chapters, blocks)).toBeNull();
  });

  it('offsetInBlock 使用 DOM 和 JavaScript 一致的 UTF-16 offset', () => {
    document.body.innerHTML = '<p data-block-id="p1">甲😀乙</p>';
    const text = document.querySelector('p')!.firstChild!;
    const range = document.createRange();
    range.setStart(text, 1);
    range.setEnd(text, 3);

    const target = createSelectionTargetFromDOMSelection(select(range), chapters, blocks);

    expect(target).toMatchObject({
      selectedText: '😀',
      start: { blockId: 'p1', offsetInBlock: 1 },
      end: { blockId: 'p1', offsetInBlock: 3 },
    });
  });
});

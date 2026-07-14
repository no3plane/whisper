import { describe, expect, it } from 'vitest';
import type { Chapter, Passage, ReadingTarget } from '../../src/shared/types';
import {
  breadcrumbsForSelection,
  captureSelection,
  locateSnapshot,
} from '../../src/renderer/selection/selectionSnapshot';

const chapters: Chapter[] = [
  {
    id: 'book-part',
    bookId: 'b',
    parentChapterId: null,
    title: '上篇',
    level: 1,
    order: 0,
    startPassageId: 'p1',
    endPassageId: 'p2',
    summary: null,
  },
  {
    id: 'section-a',
    bookId: 'b',
    parentChapterId: 'book-part',
    title: '第一节',
    level: 2,
    order: 0,
    startPassageId: 'p1',
    endPassageId: 'p1',
    summary: null,
  },
  {
    id: 'section-b',
    bookId: 'b',
    parentChapterId: 'book-part',
    title: '第二节',
    level: 2,
    order: 1,
    startPassageId: 'p2',
    endPassageId: 'p2',
    summary: null,
  },
];
const passages: Passage[] = [
  {
    id: 'p1',
    bookId: 'b',
    chapterId: 'section-a',
    order: 0,
    text: '甲乙丙',
    sourceHref: null,
    sourceOffset: 0,
  },
  {
    id: 'p2',
    bookId: 'b',
    chapterId: 'section-b',
    order: 1,
    text: '丁戊己',
    sourceHref: null,
    sourceOffset: 3,
  },
];

function selectionFor(range: Range): Selection {
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  return selection;
}

describe('selectionSnapshot', () => {
  it('捕获同 passage 内嵌文本节点的纯文本偏移', () => {
    document.body.innerHTML =
      '<article><p data-passage-id="p1">甲<strong>乙</strong>丙</p></article>';
    const paragraph = document.querySelector('p')!;
    const range = document.createRange();
    range.setStart(paragraph.firstChild!, 0);
    range.setEnd(paragraph.lastChild!, 1);

    expect(captureSelection(selectionFor(range), chapters, passages)).toMatchObject({
      type: 'selection',
      startPassageId: 'p1',
      endPassageId: 'p1',
      selectedText: '甲乙丙',
      startOffset: 0,
      endOffset: 3,
    });
  });

  it('捕获跨 passage 的文本快照', () => {
    document.body.innerHTML =
      '<article><p data-passage-id="p1">甲乙丙</p><p data-passage-id="p2">丁戊己</p></article>';
    const nodes = document.querySelectorAll('p');
    const range = document.createRange();
    range.setStart(nodes[0].firstChild!, 1);
    range.setEnd(nodes[1].firstChild!, 2);

    expect(captureSelection(selectionFor(range), chapters, passages)).toMatchObject({
      startPassageId: 'p1',
      endPassageId: 'p2',
      selectedText: '乙丙丁戊',
      startOffset: 1,
      endOffset: 2,
    });
  });

  it('跨兄弟章节只返回最低共同父章节及祖先', () => {
    expect(breadcrumbsForSelection('p1', 'p2', chapters, passages)).toEqual([
      { chapterId: 'book-part', title: '上篇' },
    ]);
  });

  it('捕获章节中间 passage 时仍生成完整面包屑', () => {
    const middlePassage = {
      ...passages[0],
      id: 'p-middle',
      chapterId: 'section-a',
      text: '中间段落',
    };
    document.body.innerHTML = '<article><p data-passage-id="p-middle">中间段落</p></article>';
    const node = document.querySelector('p')!.firstChild!;
    const range = document.createRange();
    range.setStart(node, 0);
    range.setEnd(node, 2);

    expect(
      captureSelection(selectionFor(range), chapters, [...passages, middlePassage])?.breadcrumb,
    ).toEqual([
      { chapterId: 'section-a', title: '第一节' },
      { chapterId: 'book-part', title: '上篇' },
    ]);
  });

  it('偏移失效时在起始 passage 内按 selectedText 恢复', () => {
    document.body.innerHTML =
      '<article id="reader"><p data-passage-id="p1">新增甲乙丙</p><p data-passage-id="p2">丁戊己</p></article>';
    const snapshot: ReadingTarget = {
      type: 'selection',
      chapterId: null,
      startPassageId: 'p1',
      endPassageId: 'p1',
      selectedText: '甲乙',
      startOffset: 0,
      endOffset: 2,
      breadcrumb: [],
    };

    expect(locateSnapshot(snapshot, document.querySelector('#reader')!)?.toString()).toBe('甲乙');
  });

  it('结束 passage 缺失时仍在起始 passage 搜索文本', () => {
    document.body.innerHTML =
      '<article id="reader"><p data-passage-id="p1">新增甲乙丙</p></article>';
    const snapshot: ReadingTarget = {
      type: 'selection',
      chapterId: null,
      startPassageId: 'p1',
      endPassageId: 'missing',
      selectedText: '甲乙',
      startOffset: 0,
      endOffset: 2,
      breadcrumb: [],
    };
    expect(locateSnapshot(snapshot, document.querySelector('#reader')!)?.toString()).toBe('甲乙');
  });

  it('selectedText 为空时不执行文本搜索', () => {
    document.body.innerHTML = '<article id="reader"><p data-passage-id="p1">甲乙</p></article>';
    const snapshot: ReadingTarget = {
      type: 'selection',
      chapterId: null,
      startPassageId: 'p1',
      endPassageId: 'missing',
      selectedText: '',
      startOffset: 99,
      endOffset: 100,
      breadcrumb: [],
    };
    expect(locateSnapshot(snapshot, document.querySelector('#reader')!)).toBeNull();
  });

  it('拒绝 passage 外的选区', () => {
    document.body.innerHTML = '<div>甲乙</div>';
    const node = document.querySelector('div')!.firstChild!;
    const range = document.createRange();
    range.setStart(node, 0);
    range.setEnd(node, 1);
    expect(captureSelection(selectionFor(range), chapters, passages)).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { ContextAssembler } from '../../src/main/ai/ContextAssembler';
import type { MessageReference, ReadingTarget } from '../../src/shared/types';

const chapters = [
  {
    id: 'c1',
    bookId: 'book-1',
    parentChapterId: null,
    title: '第一章',
    level: 1,
    order: 0,
    startPassageId: 'p1',
    endPassageId: 'p2',
    summary: null,
  },
  {
    id: 'c2',
    bookId: 'book-1',
    parentChapterId: null,
    title: '第三章',
    level: 1,
    order: 1,
    startPassageId: 'p3',
    endPassageId: 'p4',
    summary: null,
  },
];
const passages = [
  {
    id: 'p1',
    bookId: 'book-1',
    chapterId: 'c1',
    order: 0,
    text: '第一章开头。',
    sourceHref: null,
    sourceOffset: 0,
  },
  {
    id: 'p2',
    bookId: 'book-1',
    chapterId: 'c1',
    order: 1,
    text: '第一章结尾。',
    sourceHref: null,
    sourceOffset: 1,
  },
  {
    id: 'p3',
    bookId: 'book-1',
    chapterId: 'c2',
    order: 2,
    text: '第三章完整文本',
    sourceHref: null,
    sourceOffset: 2,
  },
  {
    id: 'p4',
    bookId: 'book-1',
    chapterId: 'c2',
    order: 3,
    text: '选区附近段落。',
    sourceHref: null,
    sourceOffset: 3,
  },
];

const chapterTarget: ReadingTarget = {
  type: 'chapter',
  chapterId: 'c2',
  startPassageId: 'p3',
  endPassageId: 'p4',
  selectedText: '',
  startOffset: null,
  endOffset: null,
  breadcrumb: [{ chapterId: 'c2', title: '第三章' }],
};
const selectionTarget: ReadingTarget = {
  type: 'selection',
  chapterId: 'c2',
  startPassageId: 'p3',
  endPassageId: 'p3',
  selectedText: '完整文本',
  startOffset: 3,
  endOffset: 7,
  breadcrumb: [{ chapterId: 'c2', title: '第三章' }],
};
const common = {
  bookTitle: '测试书',
  fullText: passages.map((item) => item.text).join('\n\n'),
  chapters,
  passages,
  target: chapterTarget,
  reference: null,
  skillInstruction: '白话解释',
  isInitialTurn: true,
  threadMessages: [{ role: 'user' as const, content: '问题' }],
  contextWindow: 10000,
};

describe('ContextAssembler', () => {
  it('完整全书已覆盖目标章节时不重复章节原文', () => {
    const result = new ContextAssembler().forReadingAction({ ...common, strategy: 'full_book' });
    expect(result.messages[0].content.split('第三章完整文本')).toHaveLength(2);
    expect(result.coveredPassageIds).toEqual(passages.map((item) => item.id));
  });

  it('压缩全书为选区补入选区和附近 passage', () => {
    const result = new ContextAssembler().forReadingAction({
      ...common,
      strategy: 'compressed_book',
      target: selectionTarget,
    });
    expect(result.messages[0].content).toContain('解读目标补充');
    expect(result.messages[0].content).toContain('完整文本');
    expect(result.messages[0].content).toContain('选区附近段落。');
  });

  it('hybrid 已覆盖目标章节时不重复目标原文', () => {
    const result = new ContextAssembler().forReadingAction({ ...common, strategy: 'hybrid' });
    expect(result.messages[0].content.split('第三章完整文本')).toHaveLength(2);
  });

  it('只有首次回答追加 skill instruction', () => {
    const initial = new ContextAssembler().forReadingAction({ ...common, strategy: 'full_book' });
    const followUp = new ContextAssembler().forReadingAction({
      ...common,
      strategy: 'full_book',
      isInitialTurn: false,
    });
    expect(initial.system).toContain('白话解释');
    expect(followUp.system).not.toContain('白话解释');
  });

  it('把当轮引用作为独立段落', () => {
    const reference: MessageReference = {
      selectedText: '另一处原文',
      startPassageId: 'p1',
      endPassageId: 'p1',
      startOffset: 0,
      endOffset: 5,
      breadcrumb: [{ chapterId: 'c1', title: '第一章' }],
    };
    const result = new ContextAssembler().forReadingAction({
      ...common,
      strategy: 'full_book',
      reference,
    });
    expect(result.messages[0].content).toContain('本轮引用：\n路径：第一章\n另一处原文');
  });

  it('完整全书超预算时降级 hybrid', () => {
    const result = new ContextAssembler().forReadingAction({
      ...common,
      strategy: 'full_book',
      fullText: '长'.repeat(5000),
      contextWindow: 2000,
      passages: [],
    });
    expect(result.effectiveStrategy).toBe('hybrid');
    expect(result.degradationReason).toContain('已降级');
  });

  it('压缩表示截断后会把账本外的目标 passage 补入', () => {
    const longPassage = { ...passages[0], text: `前部-${'长'.repeat(35980)}` };
    const result = new ContextAssembler().forReadingAction({
      ...common,
      strategy: 'compressed_book',
      chapters,
      passages: [longPassage, ...passages.slice(1)],
      target: chapterTarget,
      fullText: '',
      contextWindow: 50000,
    });
    expect(result.coveredPassageIds).not.toContain('p3');
    expect(result.messages[0].content).toContain('解读目标补充');
    expect(result.messages[0].content).toContain('第三章完整文本');
  });

  it('选区附近已采样 passage 不重复全文', () => {
    const result = new ContextAssembler().forReadingAction({
      ...common,
      strategy: 'compressed_book',
      target: selectionTarget,
    });
    expect(result.messages[0].content.split('第三章完整文本')).toHaveLength(2);
    expect(result.messages[0].content.split('选区附近段落。')).toHaveLength(2);
  });

  it('选区 passage 定位失效时仍安全输出精确选区', () => {
    const invalidTarget: ReadingTarget = {
      ...selectionTarget,
      startPassageId: 'missing-start',
      endPassageId: 'missing-end',
      selectedText: '孤立选区',
    };
    const result = new ContextAssembler().forReadingAction({
      ...common,
      strategy: 'compressed_book',
      target: invalidTarget,
    });
    expect(result.messages[0].content).toContain('精确选区：孤立选区');
  });
});

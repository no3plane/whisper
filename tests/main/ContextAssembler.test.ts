import { describe, expect, it } from 'vitest';
import { ContextAssembler } from '../../src/main/ai/ContextAssembler';
import type {
  Chapter,
  MarkdownBlock,
  MessageReference,
  ReadingTarget,
} from '../../src/shared/types';

const chapters: Chapter[] = [
  {
    id: 'c1',
    bookId: 'book-1',
    parentChapterId: null,
    title: '第一章',
    level: 1,
    order: 0,
    headingBlockId: 'p1',
    sourceStart: 0,
    sourceEnd: 2,
  },
  {
    id: 'c2',
    bookId: 'book-1',
    parentChapterId: null,
    title: '第三章',
    level: 1,
    order: 1,
    headingBlockId: 'p3',
    sourceStart: 2,
    sourceEnd: 4,
  },
];
const blocks: MarkdownBlock[] = [
  {
    id: 'p1',
    chapterId: 'c1',
    order: 0,
    type: 'paragraph',
    sourceStart: 0,
    sourceEnd: 1,
    markdown: '第一章开头。',
    plainText: '第一章开头。',
  },
  {
    id: 'p2',
    chapterId: 'c1',
    order: 1,
    type: 'paragraph',
    sourceStart: 1,
    sourceEnd: 2,
    markdown: '第一章结尾。',
    plainText: '第一章结尾。',
  },
  {
    id: 'p3',
    chapterId: 'c2',
    order: 2,
    type: 'paragraph',
    sourceStart: 2,
    sourceEnd: 3,
    markdown: '第三章完整文本',
    plainText: '第三章完整文本',
  },
  {
    id: 'p4',
    chapterId: 'c2',
    order: 3,
    type: 'paragraph',
    sourceStart: 3,
    sourceEnd: 4,
    markdown: '选区附近段落。',
    plainText: '选区附近段落。',
  },
];

const chapterTarget: ReadingTarget = {
  type: 'chapter',
  chapterId: 'c2',
  start: { blockId: 'p3', offsetInBlock: 0 },
  end: { blockId: 'p4', offsetInBlock: 0 },
  selectedText: '',
  breadcrumb: [{ chapterId: 'c2', title: '第三章' }],
};
const selectionTarget: ReadingTarget = {
  type: 'selection',
  chapterId: 'c2',
  start: { blockId: 'p3', offsetInBlock: 3 },
  end: { blockId: 'p3', offsetInBlock: 7 },
  selectedText: '完整文本',
  breadcrumb: [{ chapterId: 'c2', title: '第三章' }],
};
const common = {
  bookTitle: '测试书',
  fullText: blocks.map((item) => item.markdown).join('\n\n'),
  chapters,
  blocks,
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
    expect(result.coveredBlockIds).toEqual(blocks.map((item) => item.id));
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
      start: { blockId: 'p1', offsetInBlock: 0 },
      end: { blockId: 'p1', offsetInBlock: 5 },
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
      blocks: [],
    });
    expect(result.effectiveStrategy).toBe('hybrid');
    expect(result.degradationReason).toContain('已降级');
  });

  it('压缩表示截断后会把账本外的目标 passage 补入', () => {
    const longBlock = { ...blocks[0], markdown: `前部-${'长'.repeat(35980)}` };
    const result = new ContextAssembler().forReadingAction({
      ...common,
      strategy: 'compressed_book',
      chapters,
      blocks: [longBlock, ...blocks.slice(1)],
      target: chapterTarget,
      fullText: '',
      contextWindow: 50000,
    });
    expect(result.coveredBlockIds).not.toContain('p3');
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
      start: { blockId: 'missing-start', offsetInBlock: 0 },
      end: { blockId: 'missing-end', offsetInBlock: 0 },
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

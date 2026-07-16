import { describe, expect, it } from 'vitest';
import type { Chapter, MessageReference, ReadingTarget } from '../../src/shared/types';
import {
  applyAutomaticSelection,
  createBookDraft,
  replaceDraftFromSelection,
  selectTarget,
  validateDraft,
} from '../../src/renderer/features/conversation/draftState';
import {
  buildTargetOptions,
  targetLabel,
} from '../../src/renderer/features/conversation/targetOptions';

const selection: ReadingTarget = {
  type: 'selection',
  chapterId: 'chapter-1',
  start: { blockId: 'p1', offsetInBlock: 0 },
  end: { blockId: 'p1', offsetInBlock: 6 },
  selectedText: '选中的原文',
  breadcrumb: [{ chapterId: 'chapter-1', title: '第一章' }],
};

const anotherSelection: ReadingTarget = {
  ...selection,
  selectedText: '另一段原文',
  start: { blockId: 'p1', offsetInBlock: 7 },
  end: { blockId: 'p1', offsetInBlock: 12 },
};

const chapter: ReadingTarget = {
  type: 'chapter',
  chapterId: 'chapter-1',
  start: { blockId: 'p1', offsetInBlock: 0 },
  end: { blockId: 'p9', offsetInBlock: 0 },
  selectedText: '',
  breadcrumb: [{ chapterId: 'chapter-1', title: '第一章' }],
};

const chapters: Chapter[] = [
  {
    id: 'part-1',
    bookId: 'book-1',
    parentChapterId: null,
    title: '第一部',
    level: 1,
    order: 0,
    headingBlockId: 'h1',
    sourceStart: 0,
    sourceEnd: 100,
  },
  {
    id: 'chapter-1',
    bookId: 'book-1',
    parentChapterId: 'part-1',
    title: '第一章',
    level: 2,
    order: 1,
    headingBlockId: 'h2',
    sourceStart: 10,
    sourceEnd: 90,
  },
];

describe('新会话草稿状态', () => {
  it('从当前章节路径和选区派生完整目标菜单', () => {
    const options = buildTargetOptions(chapters, 'chapter-1', selection);
    expect(options.map((target) => target.type)).toEqual([
      'book',
      'chapter',
      'chapter',
      'selection',
    ]);
    expect(options.map(targetLabel)).toEqual(['整本书', '第一部', '第一章', '框选内容']);
    expect(options.at(-1)).toBe(selection);
  });

  it('没有阅读位置和选区时只提供整本书', () => {
    expect(buildTargetOptions(chapters, null, null)).toEqual([
      expect.objectContaining({ type: 'book' }),
    ]);
  });
  it('默认以整本书为解读目标并继承书籍策略', () => {
    expect(createBookDraft('book-1', 'hybrid')).toMatchObject({
      bookId: 'book-1',
      target: { type: 'book' },
      contextStrategy: 'hybrid',
      mode: 'auto',
      strategySource: 'book-default',
      skillType: null,
      prompt: '',
      reference: null,
    });
  });

  it('自动模式下首次选区替换整本书目标', () => {
    const draft = createBookDraft('book-1', 'full_book');
    expect(applyAutomaticSelection(draft, selection).target).toEqual(selection);
  });

  it('自动选区会清除与框选目标不兼容的整书技能', () => {
    const draft = { ...createBookDraft('book-1', 'full_book'), skillType: 'book_summary' as const };
    expect(applyAutomaticSelection(draft, selection)).toMatchObject({
      target: selection,
      skillType: null,
    });
  });

  it('手动选择章节后新选区不覆盖目标', () => {
    const draft = selectTarget(createBookDraft('book-1', 'full_book'), chapter);
    expect(applyAutomaticSelection(draft, anotherSelection)).toBe(draft);
  });

  it('围绕新选区会从书籍默认值重建草稿并保留旧输入', () => {
    const reference: MessageReference = {
      selectedText: '引用',
      start: { blockId: 'p2', offsetInBlock: 0 },
      end: { blockId: 'p2', offsetInBlock: 2 },
      breadcrumb: [],
    };
    const old = {
      ...createBookDraft('book-1', 'full_book'),
      target: selection,
      mode: 'manual' as const,
      skillType: 'plain_explanation' as const,
      prompt: '补充要求',
      reference,
      contextStrategy: 'compressed_book' as const,
      strategySource: 'draft-override' as const,
    };

    expect(replaceDraftFromSelection(old, anotherSelection, 'hybrid')).toEqual({
      ...createBookDraft('book-1', 'hybrid'),
      target: anotherSelection,
      prompt: '补充要求',
    });
  });

  it('目标改变时清除不兼容技能', () => {
    const draft = {
      ...createBookDraft('book-1', 'full_book'),
      target: selection,
      skillType: 'plain_explanation' as const,
    };
    expect(selectTarget(draft, chapter)).toMatchObject({
      target: chapter,
      skillType: null,
      mode: 'manual',
    });
  });

  it('目标改变时保留仍兼容的技能', () => {
    const draft = { ...createBookDraft('book-1', 'full_book'), skillType: 'book_summary' as const };
    expect(selectTarget(draft, draft.target).skillType).toBe('book_summary');
  });

  it('选择解读方式后可空输入发送，没有解读方式时不可发送', () => {
    const empty = createBookDraft('book-1', 'full_book');
    expect(validateDraft(empty)).toEqual({ valid: false, reason: 'method-required' });
    expect(validateDraft({ ...empty, prompt: '  问题  ' })).toEqual({
      valid: false,
      reason: 'method-required',
    });
    expect(validateDraft({ ...empty, skillType: 'book_summary' })).toEqual({ valid: true });
  });

  it('拒绝发送目标与技能不兼容的外部构造草稿', () => {
    const draft = {
      ...createBookDraft('book-1', 'full_book'),
      target: selection,
      skillType: 'book_summary' as const,
    };
    expect(validateDraft(draft)).toEqual({ valid: false, reason: 'method-not-allowed' });
  });
});

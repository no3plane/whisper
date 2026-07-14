import { describe, expect, it } from 'vitest';
import type { MessageReference, ReadingTarget } from '../../src/shared/types';
import {
  applyAutomaticSelection,
  createBookDraft,
  replaceDraftFromSelection,
  selectTarget,
  validateDraft,
} from '../../src/renderer/chat/draftState';

const selection: ReadingTarget = {
  type: 'selection',
  chapterId: 'chapter-1',
  startPassageId: 'p1',
  endPassageId: 'p1',
  selectedText: '选中的原文',
  startOffset: 0,
  endOffset: 6,
  breadcrumb: [{ chapterId: 'chapter-1', title: '第一章' }],
};

const anotherSelection: ReadingTarget = {
  ...selection,
  selectedText: '另一段原文',
  startOffset: 7,
  endOffset: 12,
};

const chapter: ReadingTarget = {
  type: 'chapter',
  chapterId: 'chapter-1',
  startPassageId: 'p1',
  endPassageId: 'p9',
  selectedText: '',
  startOffset: null,
  endOffset: null,
  breadcrumb: [{ chapterId: 'chapter-1', title: '第一章' }],
};

describe('新会话草稿状态', () => {
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

  it('围绕新选区会从书籍默认值重建草稿并清空旧输入', () => {
    const reference: MessageReference = {
      selectedText: '引用',
      startPassageId: 'p2',
      endPassageId: 'p2',
      startOffset: 0,
      endOffset: 2,
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

  it('选择技能后可空输入发送，没有技能时不可空发送', () => {
    const empty = createBookDraft('book-1', 'full_book');
    expect(validateDraft(empty)).toEqual({ valid: false, reason: 'prompt-required' });
    expect(validateDraft({ ...empty, prompt: '  问题  ' })).toEqual({ valid: true });
    expect(validateDraft({ ...empty, skillType: 'book_summary' })).toEqual({ valid: true });
  });

  it('拒绝发送目标与技能不兼容的外部构造草稿', () => {
    const draft = {
      ...createBookDraft('book-1', 'full_book'),
      target: selection,
      skillType: 'book_summary' as const,
    };
    expect(validateDraft(draft)).toEqual({ valid: false, reason: 'skill-not-allowed' });
  });
});

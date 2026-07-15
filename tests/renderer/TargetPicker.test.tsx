import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SelectionMenu } from '../../src/renderer/features/reading-selection/SelectionMenu';
import { TargetPicker } from '../../src/renderer/features/conversation/TargetPicker';
import type { ConversationDraft } from '../../src/renderer/features/conversation/draftState';
import type { ReadingTarget } from '../../src/shared/types';

afterEach(cleanup);

const selectionTarget: ReadingTarget = {
  type: 'selection',
  chapterId: 'section',
  start: { blockId: 'p1', offset: 0 },
  end: { blockId: 'p1', offset: 4 },
  selectedText: '所谓自由',
  breadcrumb: [
    { chapterId: 'part', title: '第三编' },
    { chapterId: 'chapter', title: '第八章' },
    { chapterId: 'section', title: '第二节' },
  ],
};

const draft: ConversationDraft = {
  bookId: 'book-1',
  target: selectionTarget,
  contextStrategy: 'hybrid',
  mode: 'auto',
  strategySource: 'book-default',
  skillType: 'plain_explanation',
  prompt: '',
  reference: null,
};

describe('SelectionMenu', () => {
  it('选区操作以命名工具条呈现', () => {
    render(<SelectionMenu selectedText="一段原文" mode="thread" />);
    expect(screen.getByRole('toolbar', { name: '选区操作' })).toBeTruthy();
  });

  it('草稿态只显示设为解读目标', () => {
    render(
      <SelectionMenu
        mode="draft"
        selectedText="所谓自由"
        onSetTarget={vi.fn()}
        onStartConversation={vi.fn()}
        onReference={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: '设为解读目标' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '围绕此处提问' })).toBeNull();
    expect(screen.queryByRole('button', { name: '引用到当前会话' })).toBeNull();
  });

  it('正式态提供新会话和引用两个入口', () => {
    const onStartConversation = vi.fn();
    const onReference = vi.fn();
    render(
      <SelectionMenu
        mode="thread"
        selectedText="所谓自由"
        onSetTarget={vi.fn()}
        onStartConversation={onStartConversation}
        onReference={onReference}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '围绕此处提问' }));
    fireEvent.click(screen.getByRole('button', { name: '引用到当前会话' }));
    expect(onStartConversation).toHaveBeenCalledOnce();
    expect(onReference).toHaveBeenCalledOnce();
  });
});

describe('TargetPicker', () => {
  it('点击父章节更新目标且技能只呈现当前目标可用项', () => {
    const onTargetChange = vi.fn();
    render(
      <TargetPicker
        draft={draft}
        onTargetChange={onTargetChange}
        onSkillChange={vi.fn()}
        onStrategyChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '第八章' }));
    expect(onTargetChange).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'chapter', chapterId: 'chapter' }),
    );
    expect(screen.getAllByRole('button', { name: '白话解释' })).toHaveLength(1);
  });

  it('父状态清除技能时显示轻提示', () => {
    const { rerender } = render(
      <TargetPicker
        draft={draft}
        onTargetChange={vi.fn()}
        onSkillChange={vi.fn()}
        onStrategyChange={vi.fn()}
      />,
    );
    rerender(
      <TargetPicker
        draft={{ ...draft, skillType: null }}
        onTargetChange={vi.fn()}
        onSkillChange={vi.fn()}
        onStrategyChange={vi.fn()}
      />,
    );
    expect(screen.getByRole('status').textContent).toContain('技能已清除');
  });
});

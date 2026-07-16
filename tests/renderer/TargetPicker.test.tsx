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
  start: { blockId: 'p1', offsetInBlock: 0 },
  end: { blockId: 'p1', offsetInBlock: 4 },
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
  it('选区操作只提供提问入口', () => {
    render(<SelectionMenu selectedText="一段原文" />);
    expect(screen.getByRole('toolbar', { name: '选区操作' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '提问' })).toBeTruthy();
    expect(screen.queryByText('一段原文')).toBeNull();
    expect(screen.queryByRole('button', { name: '设为解读目标' })).toBeNull();
    expect(screen.queryByRole('button', { name: '围绕此处提问' })).toBeNull();
    expect(screen.queryByRole('button', { name: '引用到当前会话' })).toBeNull();
  });

  it('点击提问调用唯一动作', () => {
    const onAsk = vi.fn();
    render(<SelectionMenu selectedText="所谓自由" onAsk={onAsk} />);
    fireEvent.click(screen.getByRole('button', { name: '提问' }));
    expect(onAsk).toHaveBeenCalledOnce();
  });

  it('按选区计算结果固定定位', () => {
    render(<SelectionMenu selectedText="所谓自由" position={{ left: 320, top: 180 }} />);
    expect(screen.getByRole('toolbar', { name: '选区操作' }).getAttribute('style')).toContain(
      'left: 320px; top: 180px',
    );
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

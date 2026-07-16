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
  it('选区操作只提供新建解读入口', () => {
    render(<SelectionMenu selectedText="一段原文" />);
    expect(screen.getByRole('toolbar', { name: '选区操作' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '新建解读' })).toBeTruthy();
    expect(screen.queryByText('一段原文')).toBeNull();
    expect(screen.queryByRole('button', { name: '设为解读目标' })).toBeNull();
    expect(screen.queryByRole('button', { name: '围绕此处提问' })).toBeNull();
    expect(screen.queryByRole('button', { name: '引用到当前会话' })).toBeNull();
  });

  it('点击新建解读调用唯一动作', () => {
    const onStartInterpretation = vi.fn();
    render(<SelectionMenu selectedText="所谓自由" onStartInterpretation={onStartInterpretation} />);
    fireEvent.click(screen.getByRole('button', { name: '新建解读' }));
    expect(onStartInterpretation).toHaveBeenCalledOnce();
  });

  it('按选区计算结果固定定位', () => {
    render(<SelectionMenu selectedText="所谓自由" position={{ left: 320, top: 180 }} />);
    expect(screen.getByRole('toolbar', { name: '选区操作' }).getAttribute('style')).toContain(
      'left: 320px; top: 180px',
    );
  });
});

describe('TargetPicker', () => {
  it('展开菜单后点击父章节更新目标', () => {
    const onTargetChange = vi.fn();
    const chapterTarget = {
      ...selectionTarget,
      type: 'chapter' as const,
      chapterId: 'chapter',
      start: null,
      end: null,
      selectedText: '',
      breadcrumb: selectionTarget.breadcrumb.slice(0, 2),
    };
    render(
      <TargetPicker
        draft={draft}
        options={[chapterTarget, selectionTarget]}
        onTargetChange={onTargetChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /框选内容/ }));
    fireEvent.click(screen.getByRole('option', { name: '第八章' }));
    expect(onTargetChange).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'chapter', chapterId: 'chapter' }),
    );
  });

  it('父状态清除技能时显示轻提示', () => {
    const { rerender } = render(
      <TargetPicker draft={draft} options={[selectionTarget]} onTargetChange={vi.fn()} />,
    );
    rerender(
      <TargetPicker
        draft={{ ...draft, skillType: null }}
        options={[selectionTarget]}
        onTargetChange={vi.fn()}
      />,
    );
    expect(screen.getByRole('status').textContent).toContain('重新选择解读方式');
  });

  it('目标菜单支持 Escape 和外部点击关闭', () => {
    render(<TargetPicker draft={draft} options={[selectionTarget]} onTargetChange={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: /框选内容/ });
    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('listbox', { name: '解读目标' })).toBeNull();
    expect(document.activeElement).toBe(trigger);

    fireEvent.click(trigger);
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('listbox', { name: '解读目标' })).toBeNull();
  });
});

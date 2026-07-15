import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BookOutline } from '../../src/renderer/features/book-outline/BookOutline';
import { buildOutlineModel } from '../../src/renderer/features/book-outline/outlineModel';
import type { Chapter } from '../../src/shared/types';

afterEach(cleanup);

function chapter(id: string, parentChapterId: string | null, order: number): Chapter {
  return {
    id,
    bookId: 'book',
    parentChapterId,
    title: id,
    level: order + 1,
    order,
    headingBlockId: `p-${id}`,
    sourceStart: order,
    sourceEnd: order + 1,
  };
}

describe('BookOutline', () => {
  it('用嵌套列表渲染层级，箭头和标题执行独立动作', () => {
    const model = buildOutlineModel([chapter('root', null, 0), chapter('child', 'root', 1)]);
    const navigate = vi.fn();
    render(<BookOutline model={model} activeChapterId="child" onNavigate={navigate} />);

    const toggle = screen.getByRole('button', { name: '折叠“root”' });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(screen.getByRole('link', { name: 'root' }));
    expect(navigate).toHaveBeenCalledWith(expect.objectContaining({ id: 'root' }));
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(toggle);
    expect(screen.queryByRole('link', { name: 'child' })).toBeNull();
    expect(navigate).toHaveBeenCalledOnce();
  });

  it('手动折叠当前分支后由父节点承接当前位置且不会自行弹开', () => {
    const model = buildOutlineModel([
      chapter('root', null, 0),
      chapter('child', 'root', 1),
      chapter('other', null, 2),
      chapter('other-child', 'other', 3),
    ]);
    const navigate = vi.fn();
    const { rerender } = render(
      <BookOutline model={model} activeChapterId="child" onNavigate={navigate} />,
    );

    fireEvent.click(screen.getByRole('button', { name: '折叠“root”' }));
    expect(screen.getByRole('link', { name: 'root' }).getAttribute('aria-current')).toBe(
      'location',
    );
    rerender(<BookOutline model={model} activeChapterId="child" onNavigate={navigate} />);
    expect(screen.queryByRole('link', { name: 'child' })).toBeNull();

    rerender(<BookOutline model={model} activeChapterId="other-child" onNavigate={navigate} />);
    expect(screen.getByRole('link', { name: 'other-child' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'child' })).toBeNull();
  });

  it('深层章节由最近的可见祖先承接当前位置', () => {
    const chapters = [
      chapter('l1', null, 0),
      chapter('l2', 'l1', 1),
      chapter('l3', 'l2', 2),
      chapter('l4', 'l3', 3),
      chapter('l5', 'l4', 4),
    ];
    render(
      <BookOutline model={buildOutlineModel(chapters)} activeChapterId="l5" onNavigate={vi.fn()} />,
    );

    expect(screen.queryByRole('link', { name: 'l5' })).toBeNull();
    expect(screen.getByRole('link', { name: 'l4' }).getAttribute('aria-current')).toBe('location');
  });

  it('当前位置离开后收起旧的自动展开分支，但保留用户主动展开的分支', () => {
    const model = buildOutlineModel([
      chapter('first', null, 0),
      chapter('first-child', 'first', 1),
      chapter('second', null, 2),
      chapter('second-child', 'second', 3),
    ]);
    const navigate = vi.fn();
    const { rerender } = render(
      <BookOutline model={model} activeChapterId="first-child" onNavigate={navigate} />,
    );
    expect(screen.getByRole('link', { name: 'first-child' })).toBeTruthy();

    rerender(<BookOutline model={model} activeChapterId="second-child" onNavigate={navigate} />);
    expect(screen.queryByRole('link', { name: 'first-child' })).toBeNull();
    expect(screen.getByRole('link', { name: 'second-child' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '展开“first”' }));
    rerender(<BookOutline model={model} activeChapterId="second-child" onNavigate={navigate} />);
    expect(screen.getByRole('link', { name: 'first-child' })).toBeTruthy();
  });
});

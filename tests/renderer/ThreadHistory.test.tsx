import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ThreadHistory } from '../../src/renderer/components/ThreadHistory';
import type { ReadingThread } from '../../src/shared/types';

afterEach(cleanup);

function thread(id: string, title: string, status: ReadingThread['status'], updatedAt: string): ReadingThread {
  return {
    id, bookId: 'book-1', title, status, updatedAt, createdAt: updatedAt, lastError: status === 'failed' ? '失败' : null,
    target: { type: 'book', chapterId: null, startPassageId: null, endPassageId: null, selectedText: '', startOffset: null, endOffset: null, breadcrumb: [] },
    skillType: null, contextStrategy: 'hybrid',
  };
}

describe('ThreadHistory', () => {
  it('生成中的会话置顶且列表不插入日期分组', () => {
    render(<ThreadHistory threads={[
      thread('ready', '最近完成', 'ready', '2026-07-12T10:00:00Z'),
      thread('streaming', '较早生成', 'streaming', '2026-07-10T10:00:00Z'),
    ]} onOpen={vi.fn()} onDelete={vi.fn()} onRetry={vi.fn()} />);
    const items = screen.getAllByRole('listitem');
    expect(items[0].textContent).toContain('较早生成');
    expect(screen.queryByText('今天')).toBeNull();
    expect(screen.queryByRole('button', { name: '删除“较早生成”' })).toBeNull();
    expect(screen.queryByText('昨天')).toBeNull();
  });

  it('删除只在确认后调用 callback', () => {
    const onDelete = vi.fn();
    render(<ThreadHistory threads={[thread('ready', '待删除', 'ready', '2026-07-12T10:00:00Z')]} onOpen={vi.fn()} onDelete={onDelete} onRetry={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '删除“待删除”' }));
    expect(onDelete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }));
    expect(onDelete).toHaveBeenCalledWith('ready');
  });

  it('失败会话显示重试入口', () => {
    const onRetry = vi.fn();
    render(<ThreadHistory threads={[thread('failed', '失败会话', 'failed', '2026-07-12T10:00:00Z')]} onOpen={vi.fn()} onDelete={vi.fn()} onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button', { name: '重试“失败会话”' }));
    expect(onRetry).toHaveBeenCalledWith('failed');
  });
});

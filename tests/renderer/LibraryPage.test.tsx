import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LibraryPage } from '../../src/renderer/pages/library-page/LibraryPage';
import type { Book } from '../../src/shared/types';

const { api } = vi.hoisted(() => ({
  api: {
    books: {
      list: vi.fn(),
      importFiles: vi.fn(),
    },
  },
}));

vi.mock('../../src/renderer/api/whisper', () => ({ whisper: api }));

const book: Book = {
  id: 'book-1',
  title: '局外人',
  author: null,
  format: 'epub',
  originalFilePath: '/books/the-stranger.epub',
  libraryFilePath: '/library/the-stranger.epub',
  createdAt: '2026-07-15T00:00:00Z',
  updatedAt: '2026-07-15T00:00:00Z',
  lastOpenedAt: null,
  preprocessStatus: 'ready',
  tokenEstimate: 1,
  defaultContextStrategy: 'hybrid',
  activeThreadId: null,
};

beforeEach(() => {
  vi.resetAllMocks();
  api.books.list.mockResolvedValue([]);
  api.books.importFiles.mockResolvedValue({ imported: [], failed: [] });
});

afterEach(cleanup);

describe('LibraryPage', () => {
  it('不显示书库标题但保留区域名称', async () => {
    render(<LibraryPage onOpenBook={vi.fn()} />);

    expect(screen.queryByRole('heading', { level: 2, name: '书库' })).toBeNull();
    expect(screen.getByRole('region', { name: '书库' })).toBeTruthy();
    await screen.findByRole('region', { name: '空书库' });
  });

  it('加载书籍并从封面式按钮打开', async () => {
    api.books.list.mockResolvedValueOnce([book]);
    const onOpenBook = vi.fn();
    render(<LibraryPage onOpenBook={onOpenBook} />);

    fireEvent.click(await screen.findByRole('button', { name: '打开《局外人》' }));

    expect(onOpenBook).toHaveBeenCalledWith(book.id);
    expect(screen.getByText('作者未知 · EPUB')).toBeTruthy();
    expect(screen.queryByRole('toolbar')).toBeNull();
    const shelf = screen.getByRole('region', { name: '藏书' });
    expect(
      within(shelf)
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label') ?? button.textContent),
    ).toEqual(['导入书籍', '打开《局外人》']);
  });

  it('没有书时显示现有导入能力的空状态', async () => {
    render(<LibraryPage onOpenBook={vi.fn()} />);

    const emptyState = await screen.findByRole('region', { name: '空书库' });
    expect(within(emptyState).getByText('书房还是空的')).toBeTruthy();
    expect(within(emptyState).getByRole('button', { name: '导入书籍' })).toBeTruthy();
    expect(screen.queryByText('支持 Markdown 和 EPUB，可多选')).toBeNull();
  });

  it('书库加载完成前不提前显示空状态', () => {
    api.books.list.mockReturnValueOnce(new Promise(() => undefined));
    render(<LibraryPage onOpenBook={vi.fn()} />);

    expect(screen.getByRole('status').textContent).toContain('正在整理书房');
    expect(screen.queryByText('书房还是空的')).toBeNull();
  });

  it('点击导入按钮时直接打开支持多选的文件输入', async () => {
    const { container } = render(<LibraryPage onOpenBook={vi.fn()} />);
    await screen.findByText('书房还是空的');
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const click = vi.spyOn(input, 'click');

    fireEvent.click(screen.getByRole('button', { name: '导入书籍' }));

    expect(click).toHaveBeenCalledOnce();
    expect(input.multiple).toBe(true);
    expect(input.accept).toBe('.md,.markdown,.epub');
  });

  it('选择多本书导入后重新加载书库并显示成功数量', async () => {
    api.books.list.mockResolvedValueOnce([]).mockResolvedValueOnce([book]);
    api.books.importFiles.mockResolvedValueOnce({ imported: [book, book], failed: [] });
    const { container } = render(<LibraryPage onOpenBook={vi.fn()} />);
    await screen.findByText('书房还是空的');
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const files = [new File(['a'], 'notes.md'), new File(['b'], 'novel.epub')];

    fireEvent.change(input, { target: { files } });

    await waitFor(() => expect(api.books.importFiles).toHaveBeenCalledWith(files));
    await waitFor(() => expect(api.books.list).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('status').textContent).toContain('已导入 2 本书');
    expect(await screen.findByRole('button', { name: '打开《局外人》' })).toBeTruthy();
  });

  it('取消文件选择时不重新加载书库也不显示反馈', async () => {
    const { container } = render(<LibraryPage onOpenBook={vi.fn()} />);
    await screen.findByText('书房还是空的');
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;

    fireEvent.change(input, { target: { files: [] } });

    expect(api.books.importFiles).not.toHaveBeenCalled();
    expect(api.books.list).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/已导入/)).toBeNull();
  });

  it('部分导入失败时刷新书库并展示失败文件和原因', async () => {
    api.books.list.mockResolvedValueOnce([]).mockResolvedValueOnce([book]);
    api.books.importFiles.mockResolvedValueOnce({
      imported: [book],
      failed: [{ fileName: 'broken.epub', reason: '无法解析 EPUB' }],
    });
    const { container } = render(<LibraryPage onOpenBook={vi.fn()} />);
    await screen.findByText('书房还是空的');
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;

    fireEvent.change(input, { target: { files: [new File(['bad'], 'broken.epub')] } });

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('成功 1 本，失败 1 本');
    expect(alert.textContent).toContain('broken.epub：无法解析 EPUB');
    expect(api.books.list).toHaveBeenCalledTimes(2);
  });
});

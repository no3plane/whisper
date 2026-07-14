import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LibraryPage } from '../../src/renderer/pages/library-page/LibraryPage';
import type { Book } from '../../src/shared/types';

const { api } = vi.hoisted(() => ({
  api: {
    books: {
      list: vi.fn(),
      importMarkdown: vi.fn(),
      importEpub: vi.fn(),
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
  vi.clearAllMocks();
  api.books.list.mockResolvedValue([]);
  api.books.importMarkdown.mockResolvedValue(book);
  api.books.importEpub.mockResolvedValue(book);
});

afterEach(cleanup);

describe('LibraryPage', () => {
  it('加载书籍并从封面式按钮打开', async () => {
    api.books.list.mockResolvedValueOnce([book]);
    const onOpenBook = vi.fn();
    render(<LibraryPage onOpenBook={onOpenBook} />);

    fireEvent.click(await screen.findByRole('button', { name: '打开《局外人》' }));

    expect(onOpenBook).toHaveBeenCalledWith(book.id);
    expect(screen.getByText('作者未知 · EPUB')).toBeTruthy();
  });

  it('没有书时显示现有导入能力的空状态', async () => {
    render(<LibraryPage onOpenBook={vi.fn()} />);

    expect(await screen.findByText('书房还是空的')).toBeTruthy();
    expect(screen.getByPlaceholderText('输入本机书籍文件路径')).toBeTruthy();
  });

  it('书库加载完成前不提前显示空状态', () => {
    api.books.list.mockReturnValueOnce(new Promise(() => undefined));
    render(<LibraryPage onOpenBook={vi.fn()} />);

    expect(screen.getByRole('status').textContent).toContain('正在整理书房');
    expect(screen.queryByText('书房还是空的')).toBeNull();
  });

  it('导入 Markdown 后清空路径并重新加载书库', async () => {
    api.books.list.mockResolvedValueOnce([]).mockResolvedValueOnce([book]);
    render(<LibraryPage onOpenBook={vi.fn()} />);
    await screen.findByText('书房还是空的');
    const pathInput = screen.getByPlaceholderText('输入本机书籍文件路径');

    fireEvent.change(pathInput, { target: { value: '/books/notes.md' } });
    fireEvent.click(screen.getByRole('button', { name: '导入 Markdown' }));

    await waitFor(() =>
      expect(api.books.importMarkdown).toHaveBeenCalledWith({ filePath: '/books/notes.md' }),
    );
    await waitFor(() => expect(api.books.list).toHaveBeenCalledTimes(2));
    expect((pathInput as HTMLInputElement).value).toBe('');
    expect(await screen.findByRole('button', { name: '打开《局外人》' })).toBeTruthy();
  });

  it('导入 EPUB 后清空路径并重新加载书库', async () => {
    api.books.list.mockResolvedValueOnce([]).mockResolvedValueOnce([book]);
    render(<LibraryPage onOpenBook={vi.fn()} />);
    await screen.findByText('书房还是空的');
    const pathInput = screen.getByPlaceholderText('输入本机书籍文件路径');

    fireEvent.change(pathInput, { target: { value: '/books/novel.epub' } });
    fireEvent.click(screen.getByRole('button', { name: '导入 EPUB' }));

    await waitFor(() =>
      expect(api.books.importEpub).toHaveBeenCalledWith({ filePath: '/books/novel.epub' }),
    );
    await waitFor(() => expect(api.books.list).toHaveBeenCalledTimes(2));
    expect((pathInput as HTMLInputElement).value).toBe('');
  });

  it('导入失败时展示错误且保留路径', async () => {
    api.books.importEpub.mockRejectedValueOnce(new Error('无法解析 EPUB'));
    render(<LibraryPage onOpenBook={vi.fn()} />);
    await screen.findByText('书房还是空的');
    const pathInput = screen.getByPlaceholderText('输入本机书籍文件路径');

    fireEvent.change(pathInput, { target: { value: '/books/broken.epub' } });
    fireEvent.click(screen.getByRole('button', { name: '导入 EPUB' }));

    expect((await screen.findByRole('alert')).textContent).toContain('无法解析 EPUB');
    expect((pathInput as HTMLInputElement).value).toBe('/books/broken.epub');
    expect(api.books.list).toHaveBeenCalledTimes(1);
  });
});

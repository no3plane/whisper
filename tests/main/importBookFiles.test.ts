import { describe, expect, it, vi } from 'vitest';
import { importBookFiles } from '../../src/main/ipc/importBookFiles';
import type { Book } from '../../src/shared/types';

const book = { id: 'book-1' } as Book;

describe('importBookFiles', () => {
  it('只导入大小写不敏感的 .md 并拒绝其他格式', () => {
    const library = {
      importMarkdown: vi.fn().mockReturnValue(book),
    };

    const result = importBookFiles(
      ['/books/notes.md', '/books/upper.MD', '/books/novel.txt', '/books/notes.markdown'],
      library,
    );

    expect(library.importMarkdown).toHaveBeenCalledWith('/books/notes.md');
    expect(library.importMarkdown).toHaveBeenCalledWith('/books/upper.MD');
    expect(result).toEqual({
      imported: [book, book],
      failed: [
        { fileName: 'novel.txt', reason: '不支持的文件格式，仅支持 .md。' },
        { fileName: 'notes.markdown', reason: '不支持的文件格式，仅支持 .md。' },
      ],
    });
  });

  it('单本失败不阻止其余文件导入', () => {
    const library = {
      importMarkdown: vi.fn().mockReturnValue(book),
    };
    library.importMarkdown.mockImplementationOnce(() => {
      throw new Error('无法读取 Markdown');
    });

    const result = importBookFiles(['/books/broken.md', '/books/notes.md'], library);

    expect(result).toEqual({
      imported: [book],
      failed: [{ fileName: 'broken.md', reason: '无法读取 Markdown' }],
    });
  });
});

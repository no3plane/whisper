import { describe, expect, it, vi } from 'vitest';
import { importBookFiles } from '../../src/main/ipc/importBookFiles';
import type { Book } from '../../src/shared/types';

const book = { id: 'book-1' } as Book;

describe('importBookFiles', () => {
  it('按扩展名批量导入 Markdown 和 EPUB', () => {
    const library = {
      importMarkdown: vi.fn().mockReturnValue(book),
      importEpub: vi.fn().mockReturnValue(book),
    };

    const result = importBookFiles(['/books/notes.md', '/books/novel.EPUB'], library);

    expect(library.importMarkdown).toHaveBeenCalledWith('/books/notes.md');
    expect(library.importEpub).toHaveBeenCalledWith('/books/novel.EPUB');
    expect(result).toEqual({ imported: [book, book], failed: [] });
  });

  it('单本失败不阻止其余文件导入', () => {
    const library = {
      importMarkdown: vi.fn().mockReturnValue(book),
      importEpub: vi.fn().mockImplementation(() => {
        throw new Error('无法解析 EPUB');
      }),
    };

    const result = importBookFiles(['/books/broken.epub', '/books/notes.markdown'], library);

    expect(result).toEqual({
      imported: [book],
      failed: [{ fileName: 'broken.epub', reason: '无法解析 EPUB' }],
    });
  });
});

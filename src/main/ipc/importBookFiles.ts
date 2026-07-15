import { basename, extname } from 'node:path';
import type { Book, ImportBooksResult } from '../../shared/types';

interface BookImporter {
  importMarkdown(filePath: string): Book;
}

export function importBookFiles(filePaths: string[], library: BookImporter): ImportBooksResult {
  const result: ImportBooksResult = { imported: [], failed: [] };

  for (const filePath of filePaths) {
    try {
      if (extname(filePath).toLowerCase() !== '.md') {
        throw new Error('不支持的文件格式，仅支持 .md。');
      }
      const book = library.importMarkdown(filePath);
      result.imported.push(book);
    } catch (error) {
      result.failed.push({
        fileName: basename(filePath),
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return result;
}

import { basename, extname } from 'node:path';
import type { Book, ImportBooksResult } from '../../shared/types';

interface BookImporter {
  importMarkdown(filePath: string): Book;
  importEpub(filePath: string): Book;
}

export function importBookFiles(filePaths: string[], library: BookImporter): ImportBooksResult {
  const result: ImportBooksResult = { imported: [], failed: [] };

  for (const filePath of filePaths) {
    try {
      const extension = extname(filePath).toLowerCase();
      const book =
        extension === '.epub' ? library.importEpub(filePath) : library.importMarkdown(filePath);
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

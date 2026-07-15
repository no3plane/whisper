import { describe, expect, it } from 'vitest';
import { ipcInputSchemas, parseIpcInput } from '../../src/shared/ipcSchemas';

describe('IPC 输入 schema', () => {
  it('接受合法设置并拒绝额外字段', () => {
    const settings = {
      baseURL: 'https://example.com',
      apiKey: 'secret',
      model: 'model',
      contextWindow: 8192,
      defaultContextStrategy: 'full_book' as const,
    };
    expect(parseIpcInput('settings.save', ipcInputSchemas.aiSettings, settings)).toEqual(settings);
    expect(() =>
      parseIpcInput('settings.save', ipcInputSchemas.aiSettings, { ...settings, injected: true }),
    ).toThrow('IPC 参数无效（settings.save）');
  });

  it('拒绝空白 ID 和错误的嵌套字段类型', () => {
    expect(() => parseIpcInput('books.open', ipcInputSchemas.bookId, '  ')).toThrow('books.open');
    expect(() =>
      parseIpcInput('ai.retry', ipcInputSchemas.retry, { threadId: 't1', messageId: 1 }),
    ).toThrow('messageId');
  });

  it('批量导入只接受非空的本机路径数组', () => {
    expect(
      parseIpcInput('books.importFiles', ipcInputSchemas.importBookFiles, [
        '/tmp/a.md',
        '/tmp/b.MD',
      ]),
    ).toEqual(['/tmp/a.md', '/tmp/b.MD']);
    expect(() =>
      parseIpcInput('books.importFiles', ipcInputSchemas.importBookFiles, ['/tmp/b.txt']),
    ).toThrow('仅支持 .md 文件');
    expect(() => parseIpcInput('books.importFiles', ipcInputSchemas.importBookFiles, [])).toThrow(
      'books.importFiles',
    );
    expect(() =>
      parseIpcInput('books.importFiles', ipcInputSchemas.importBookFiles, ['/tmp/a.md', '  ']),
    ).toThrow('books.importFiles');
  });
});

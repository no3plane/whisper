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

  it('兼容字符串和对象两种导入参数', () => {
    expect(parseIpcInput('books.importMarkdown', ipcInputSchemas.importBook, '/tmp/a.md')).toBe(
      '/tmp/a.md',
    );
    expect(
      parseIpcInput('books.importMarkdown', ipcInputSchemas.importBook, { filePath: '/tmp/a.md' }),
    ).toEqual({
      filePath: '/tmp/a.md',
    });
  });
});

import { describe, expect, it } from 'vitest';
import { MarkdownParser } from '../../src/main/library/MarkdownParser';

describe('MarkdownParser', () => {
  it('把 markdown 标题解析成章节并生成 passage', () => {
    const parser = new MarkdownParser();
    const result = parser.parse({
      bookId: 'book-1',
      markdown: '# 第一章\n\n这是第一段。\n\n这是第二段。\n\n## 小节\n\n这是第三段。',
    });

    expect(result.chapters).toHaveLength(2);
    expect(result.chapters[0]).toMatchObject({
      bookId: 'book-1',
      title: '第一章',
      level: 1,
      order: 0,
    });
    expect(result.chapters[1]).toMatchObject({
      title: '小节',
      level: 2,
      order: 1,
    });
    expect(result.passages.map((passage) => passage.text)).toEqual(['这是第一段。', '这是第二段。', '这是第三段。']);
    expect(result.fullText).toContain('这是第三段。');
  });
});

import { describe, expect, it } from 'vitest';
import { analyzeMarkdown, markdownNodeId } from '../../src/shared/markdown/analyzeMarkdown';

describe('analyzeMarkdown', () => {
  it('从 CommonMark/GFM 派生有序 block、章节树和结构化文本', () => {
    const markdown =
      '# 第一章\n\n正文 **重点**。\n\n- A\n- B\n\n```ts\nconst x = 1\n```\n\n## 小节\n\n| A | B |\n| - | - |\n| 1 | 2 |';
    const result = analyzeMarkdown({ bookId: 'b1', markdown });

    expect(result.chapters.map(({ title, level }) => [title, level])).toEqual([
      ['第一章', 1],
      ['小节', 2],
    ]);
    expect(result.blocks.map(({ type }) => type)).toEqual([
      'heading',
      'paragraph',
      'list',
      'code',
      'heading',
      'table',
    ]);
    expect(result.blocks[0].id).toBe(markdownNodeId('b1', 'heading', 0));
    expect(result.blocks[1].chapterId).toBe(result.chapters[0].id);
    expect(result.structuredText).toContain('```ts\nconst x = 1\n```');
    expect(result.structuredText).toContain('| A | B |');
  });

  it('处理同名、空章节、标题跳级和无标题文档，且结果确定', () => {
    const input = { bookId: 'b1', markdown: '# 重复\n## 重复\n#### 跳级\n# 空章节' };

    expect(analyzeMarkdown(input)).toEqual(analyzeMarkdown(input));
    expect(analyzeMarkdown(input).chapters).toHaveLength(4);
    expect(analyzeMarkdown({ bookId: 'b1', markdown: '只有正文' }).chapters).toEqual([]);
  });

  it('按同级或更高层级标题界定章节源码范围', () => {
    const markdown = '# 上篇\n\n## 第一章\n\n正文\n\n# 下篇';
    const result = analyzeMarkdown({ bookId: 'b1', markdown });

    expect(markdown.slice(result.chapters[0].sourceStart, result.chapters[0].sourceEnd)).toContain(
      '正文',
    );
    expect(result.chapters[0].sourceEnd).toBe(result.chapters[2].sourceStart);
    expect(result.chapters[1].sourceEnd).toBe(result.chapters[2].sourceStart);
  });
});

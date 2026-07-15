import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MarkdownDocument } from '../../src/renderer/features/markdown-reading/MarkdownDocument';
import { analyzeMarkdown } from '../../src/shared/markdown/analyzeMarkdown';

describe('MarkdownDocument', () => {
  it('渲染 GFM 并给顶层 block 注入稳定锚点', () => {
    const markdown = '# 标题\n\n正文 **重点**。\n\n| A | B |\n| - | - |\n| 1 | 2 |';
    const analysis = analyzeMarkdown({ bookId: 'b1', markdown });
    const { container } = render(
      <MarkdownDocument markdown={markdown} blocks={analysis.blocks} resources={{}} />,
    );

    expect(screen.getByRole('heading', { name: '标题' }).id).toBe(analysis.blocks[0].id);
    expect(screen.getByText(/正文/)).toBeTruthy();
    expect(container.querySelector('table')?.dataset.blockId).toBe(analysis.blocks[2].id);
  });

  it('跳过原始 HTML，并阻止远程图片与危险链接', () => {
    const markdown =
      '<script>alert(1)</script>\n\n[危险](javascript:alert(1))\n\n![远程](https://example.com/a.png)';
    const analysis = analyzeMarkdown({ bookId: 'b1', markdown });
    const { container } = render(
      <MarkdownDocument markdown={markdown} blocks={analysis.blocks} resources={{}} />,
    );

    expect(container.querySelector('script')).toBeNull();
    expect(screen.getByText('危险').tagName).toBe('SPAN');
    expect(screen.getByText('图片未加载：远程')).toBeTruthy();
  });
});

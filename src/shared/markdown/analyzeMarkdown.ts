import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import type { Chapter, MarkdownBlock, MarkdownAnalysis } from '../types';

export interface MarkdownNode {
  type: string;
  depth?: number;
  value?: string;
  alt?: string;
  url?: string;
  children?: MarkdownNode[];
  position?: { start: { offset?: number }; end: { offset?: number } };
}

function textOf(node: MarkdownNode): string {
  return node.value ?? node.alt ?? (node.children ?? []).map(textOf).join('');
}

export function markdownNodeId(bookId: string, type: string, sourceStart: number): string {
  return `${bookId}-md-${type}-${sourceStart}`;
}

export function parseMarkdown(markdown: string): MarkdownNode {
  return unified().use(remarkParse).use(remarkGfm).parse(markdown) as MarkdownNode;
}

export function analyzeMarkdown(input: { bookId: string; markdown: string }): MarkdownAnalysis {
  const root = parseMarkdown(input.markdown);
  const nodes = (root.children ?? []).filter(
    (node) => node.position?.start.offset != null && node.position.end.offset != null,
  );
  const chapters: Chapter[] = [];
  const stack: Chapter[] = [];
  let currentChapterId: string | null = null;
  const blocks: MarkdownBlock[] = [];

  for (const [order, node] of nodes.entries()) {
    const sourceStart = node.position!.start.offset!;
    const sourceEnd = node.position!.end.offset!;
    const id = markdownNodeId(input.bookId, node.type, sourceStart);
    if (node.type === 'heading') {
      const level = node.depth ?? 1;
      while (stack.at(-1) && stack.at(-1)!.level >= level) {
        stack.pop();
      }
      const chapter: Chapter = {
        id,
        bookId: input.bookId,
        parentChapterId: stack.at(-1)?.id ?? null,
        headingBlockId: id,
        title: textOf(node).trim() || `未命名章节 ${chapters.length + 1}`,
        level,
        order: chapters.length,
        sourceStart,
        sourceEnd: input.markdown.length,
      };
      chapters.push(chapter);
      stack.push(chapter);
      currentChapterId = id;
    }
    blocks.push({
      id,
      type: node.type,
      chapterId: currentChapterId,
      order,
      sourceStart,
      sourceEnd,
      markdown: input.markdown.slice(sourceStart, sourceEnd),
      plainText: textOf(node).trim(),
    });
  }

  for (const [index, chapter] of chapters.entries()) {
    const boundary = chapters.slice(index + 1).find((item) => item.level <= chapter.level);
    chapter.sourceEnd = boundary?.sourceStart ?? input.markdown.length;
  }
  return {
    chapters,
    blocks,
    structuredText: blocks.map((block) => block.markdown).join('\n\n'),
    plainText: blocks
      .map((block) => block.plainText)
      .filter(Boolean)
      .join('\n\n'),
  };
}

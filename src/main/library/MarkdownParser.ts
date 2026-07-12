import GithubSlugger from 'github-slugger';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';
import type { Chapter, Passage } from '../../shared/types';

interface ParseInput {
  bookId: string;
  markdown: string;
}

interface ParseResult {
  chapters: Chapter[];
  passages: Passage[];
  fullText: string;
}

interface MarkdownNode {
  type: string;
  value?: string;
  depth?: number;
  children?: MarkdownNode[];
}

function textFromNode(node: MarkdownNode): string {
  if (typeof node.value === 'string') {
    return node.value;
  }

  return (node.children ?? []).map(textFromNode).join('');
}

function textFromChildren(children: MarkdownNode[] | undefined): string {
  return (children ?? []).map(textFromNode).join('').trim();
}

export class MarkdownParser {
  parse(input: ParseInput): ParseResult {
    const tree = unified().use(remarkParse).parse(input.markdown);
    const slugger = new GithubSlugger();
    const chapters: Chapter[] = [];
    const passages: Passage[] = [];
    const headingStack: Chapter[] = [];
    const chapterStartIndexes = new Map<string, number>();
    let currentChapterId: string | null = null;

    visit(tree, (node) => {
      const markdownNode = node as MarkdownNode;

      if (markdownNode.type === 'heading') {
        const title = textFromChildren(markdownNode.children);
        const fallbackTitle = `未命名章节 ${chapters.length + 1}`;
        const id = `${input.bookId}-chapter-${slugger.slug(title || `chapter-${chapters.length}`)}`;
        const level = markdownNode.depth ?? 1;

        while (headingStack.at(-1) && headingStack.at(-1)!.level >= level) {
          headingStack.pop();
        }

        currentChapterId = id;
        const chapter: Chapter = {
          id,
          bookId: input.bookId,
          parentChapterId: headingStack.at(-1)?.id ?? null,
          title: title || fallbackTitle,
          level,
          order: chapters.length,
          startPassageId: '',
          endPassageId: '',
          summary: null,
        };
        chapters.push(chapter);
        headingStack.push(chapter);
        chapterStartIndexes.set(id, passages.length);
      }

      if (markdownNode.type === 'paragraph') {
        const text = textFromChildren(markdownNode.children);
        if (!text) {
          return;
        }

        passages.push({
          id: `${input.bookId}-passage-${passages.length}`,
          bookId: input.bookId,
          chapterId: currentChapterId,
          order: passages.length,
          text,
          sourceHref: null,
          sourceOffset: passages.length,
        });
      }
    });

    for (const [chapterIndex, chapter] of chapters.entries()) {
      const startIndex = chapterStartIndexes.get(chapter.id) ?? passages.length;
      const nextBoundary = chapters
        .slice(chapterIndex + 1)
        .find((candidate) => candidate.level <= chapter.level);
      const endIndex = nextBoundary ? (chapterStartIndexes.get(nextBoundary.id) ?? passages.length) : passages.length;
      const chapterPassages = passages.slice(startIndex, endIndex);
      chapter.startPassageId = chapterPassages[0]?.id ?? '';
      chapter.endPassageId = chapterPassages.at(-1)?.id ?? '';
    }

    return {
      chapters,
      passages,
      fullText: passages.map((passage) => passage.text).join('\n\n'),
    };
  }
}

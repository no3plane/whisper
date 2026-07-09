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
    let currentChapterId: string | null = null;

    visit(tree, (node) => {
      const markdownNode = node as MarkdownNode;

      if (markdownNode.type === 'heading') {
        const title = textFromChildren(markdownNode.children);
        const fallbackTitle = `未命名章节 ${chapters.length + 1}`;
        const id = `${input.bookId}-chapter-${slugger.slug(title || `chapter-${chapters.length}`)}`;

        currentChapterId = id;
        chapters.push({
          id,
          bookId: input.bookId,
          parentChapterId: null,
          title: title || fallbackTitle,
          level: markdownNode.depth ?? 1,
          order: chapters.length,
          startPassageId: '',
          endPassageId: '',
          summary: null,
        });
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

    for (const chapter of chapters) {
      const chapterPassages = passages.filter((passage) => passage.chapterId === chapter.id);
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

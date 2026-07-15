import { useEffect, useState, type RefObject } from 'react';
import type { MarkdownBlock } from '../../../shared/types';

interface BlockIdentity {
  id: string;
  chapterId: string | null;
}

export function chapterAtReadingLine(
  blocks: BlockIdentity[],
  topById: (id: string) => number | null,
  lineY: number,
) {
  let low = 0;
  let high = blocks.length - 1;
  let candidate = blocks[0]?.chapterId ?? null;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const block = blocks[middle];
    const top = topById(block.id);
    if (top === null) {
      return chapterAtReadingLineLinear(blocks, topById, lineY);
    }
    if (top > lineY) {
      high = middle - 1;
    } else {
      candidate = block.chapterId;
      low = middle + 1;
    }
  }
  return candidate;
}

function chapterAtReadingLineLinear(
  blocks: BlockIdentity[],
  topById: (id: string) => number | null,
  lineY: number,
) {
  let candidate = blocks[0]?.chapterId ?? null;
  for (const block of blocks) {
    const top = topById(block.id);
    if (top === null) {
      continue;
    }
    if (top > lineY) {
      break;
    }
    candidate = block.chapterId;
  }
  return candidate;
}

export function useReadingPosition(
  containerRef: RefObject<HTMLElement | null>,
  blocks: MarkdownBlock[],
) {
  const [chapterId, setChapterId] = useState<string | null>(blocks[0]?.chapterId ?? null);

  useEffect(() => {
    const scrollContainer = containerRef.current;
    if (!scrollContainer) {
      return;
    }

    const update = () => {
      const containerRect = scrollContainer.getBoundingClientRect();
      const readingLine = containerRect.top + scrollContainer.clientHeight * 0.3;
      setChapterId(
        chapterAtReadingLine(
          blocks,
          (id) => globalThis.document.getElementById(id)?.getBoundingClientRect().top ?? null,
          readingLine,
        ),
      );
    };
    let resizeFrame = 0;
    const updateAfterResize = () => {
      if (!resizeFrame) {
        resizeFrame = requestAnimationFrame(() => {
          resizeFrame = 0;
          update();
        });
      }
    };

    update();
    scrollContainer.addEventListener('scrollend', update);
    window.addEventListener('resize', updateAfterResize);
    return () => {
      scrollContainer.removeEventListener('scrollend', update);
      window.removeEventListener('resize', updateAfterResize);
      if (resizeFrame) {
        cancelAnimationFrame(resizeFrame);
      }
    };
  }, [blocks, containerRef]);

  return chapterId;
}

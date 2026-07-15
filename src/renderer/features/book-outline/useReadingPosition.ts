import { useEffect, useState, type RefObject } from 'react';
import type { Passage } from '../../../shared/types';

interface PassageIdentity {
  id: string;
  chapterId: string | null;
}

export function chapterAtReadingLine(
  passages: PassageIdentity[],
  topById: (id: string) => number | null,
  lineY: number,
) {
  let low = 0;
  let high = passages.length - 1;
  let candidate = passages[0]?.chapterId ?? null;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const passage = passages[middle];
    const top = topById(passage.id);
    if (top === null) {
      return chapterAtReadingLineLinear(passages, topById, lineY);
    }
    if (top > lineY) {
      high = middle - 1;
    } else {
      candidate = passage.chapterId;
      low = middle + 1;
    }
  }
  return candidate;
}

function chapterAtReadingLineLinear(
  passages: PassageIdentity[],
  topById: (id: string) => number | null,
  lineY: number,
) {
  let candidate = passages[0]?.chapterId ?? null;
  for (const passage of passages) {
    const top = topById(passage.id);
    if (top === null) {
      continue;
    }
    if (top > lineY) {
      break;
    }
    candidate = passage.chapterId;
  }
  return candidate;
}

export function useReadingPosition(
  containerRef: RefObject<HTMLElement | null>,
  passages: Passage[],
) {
  const [chapterId, setChapterId] = useState<string | null>(passages[0]?.chapterId ?? null);

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
          passages,
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
  }, [containerRef, passages]);

  return chapterId;
}

import type { Chapter, ReadingTarget } from '../../../shared/types';

export function buildTargetOptions(
  chapters: readonly Chapter[],
  activeChapterId: string | null,
  selectionTarget: ReadingTarget | null,
): ReadingTarget[] {
  const options: ReadingTarget[] = [bookTarget()];
  const byId = new Map(chapters.map((chapter) => [chapter.id, chapter]));
  const path: Chapter[] = [];
  const seen = new Set<string>();
  let current = activeChapterId ? byId.get(activeChapterId) : undefined;

  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift(current);
    current = current.parentChapterId ? byId.get(current.parentChapterId) : undefined;
  }

  const breadcrumb: ReadingTarget['breadcrumb'] = [];
  for (const chapter of path) {
    breadcrumb.push({ chapterId: chapter.id, title: chapter.title });
    options.push({
      type: 'chapter',
      chapterId: chapter.id,
      start: null,
      end: null,
      selectedText: '',
      breadcrumb: [...breadcrumb],
    });
  }

  if (selectionTarget?.type === 'selection' && selectionTarget.selectedText.trim()) {
    options.push(selectionTarget);
  }
  return options;
}

export function targetLabel(target: ReadingTarget): string {
  if (target.type === 'book') {
    return '整本书';
  }
  if (target.type === 'selection') {
    return '框选内容';
  }
  return target.breadcrumb.at(-1)?.title ?? '当前章节';
}

function bookTarget(): ReadingTarget {
  return {
    type: 'book',
    chapterId: null,
    start: null,
    end: null,
    selectedText: '',
    breadcrumb: [],
  };
}

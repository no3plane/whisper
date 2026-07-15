import type { Chapter } from '../../../shared/types';

export interface OutlineNode {
  chapter: Chapter;
  depth: number;
  children: OutlineNode[];
}

export interface OutlineModel {
  roots: OutlineNode[];
  visiblePathByChapterId: ReadonlyMap<string, readonly string[]>;
}

export function buildOutlineModel(chapters: Chapter[], maxDepth = 4): OutlineModel {
  const ordered = [...chapters].sort((left, right) => left.order - right.order);
  const byId = new Map(ordered.map((chapter) => [chapter.id, chapter]));
  const childrenByParent = new Map<string | null, Chapter[]>();

  for (const chapter of ordered) {
    const parentId = validParentId(chapter, byId);
    const children = childrenByParent.get(parentId) ?? [];
    children.push(chapter);
    childrenByParent.set(parentId, children);
  }

  const visiblePathByChapterId = new Map<string, readonly string[]>();
  const visited = new Set<string>();

  function visit(
    chapter: Chapter,
    depth: number,
    visiblePath: readonly string[],
    ancestors: ReadonlySet<string>,
  ): OutlineNode | null {
    if (ancestors.has(chapter.id)) {
      return null;
    }

    visited.add(chapter.id);
    const nextAncestors = new Set(ancestors).add(chapter.id);
    const nextVisiblePath = depth <= maxDepth ? [...visiblePath, chapter.id] : visiblePath;
    visiblePathByChapterId.set(chapter.id, nextVisiblePath);
    const descendants = childrenByParent.get(chapter.id) ?? [];

    if (depth > maxDepth) {
      for (const descendant of descendants) {
        visit(descendant, depth + 1, nextVisiblePath, nextAncestors);
      }
      return null;
    }

    const children: OutlineNode[] = [];
    for (const descendant of descendants) {
      const child = visit(descendant, depth + 1, nextVisiblePath, nextAncestors);
      if (child) {
        children.push(child);
      }
    }
    return { chapter, depth, children };
  }

  const roots: OutlineNode[] = [];
  for (const chapter of childrenByParent.get(null) ?? []) {
    const root = visit(chapter, 1, [], new Set());
    if (root) {
      roots.push(root);
    }
  }

  for (const chapter of ordered) {
    if (!visited.has(chapter.id)) {
      const root = visit(chapter, 1, [], new Set());
      if (root) {
        roots.push(root);
      }
    }
  }

  return { roots, visiblePathByChapterId };
}

function validParentId(chapter: Chapter, byId: ReadonlyMap<string, Chapter>) {
  const parentId = chapter.parentChapterId;
  return parentId && parentId !== chapter.id && byId.has(parentId) ? parentId : null;
}

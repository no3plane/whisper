import { describe, expect, it } from 'vitest';
import { buildOutlineModel } from '../../src/renderer/features/book-outline/outlineModel';
import type { Chapter } from '../../src/shared/types';

function chapter(id: string, parentChapterId: string | null, order: number): Chapter {
  return {
    id,
    bookId: 'book',
    parentChapterId,
    title: id,
    level: order + 2,
    order,
    headingBlockId: `p-${id}`,
    sourceStart: order,
    sourceEnd: order + 1,
  };
}

describe('buildOutlineModel', () => {
  it('按父子关系和 order 构建相对层级，不依赖 level', () => {
    const model = buildOutlineModel([
      chapter('child-2', 'root', 2),
      chapter('root', null, 0),
      chapter('child-1', 'root', 1),
    ]);

    expect(model.roots.map((node) => node.chapter.id)).toEqual(['root']);
    expect(model.roots[0].children.map((node) => node.chapter.id)).toEqual(['child-1', 'child-2']);
    expect(model.roots[0].children[0].depth).toBe(2);
  });

  it('最多展示四层并把深层章节映射到最近可见祖先', () => {
    const model = buildOutlineModel([
      chapter('l1', null, 0),
      chapter('l2', 'l1', 1),
      chapter('l3', 'l2', 2),
      chapter('l4', 'l3', 3),
      chapter('l5', 'l4', 4),
      chapter('l6', 'l5', 5),
    ]);

    const level4 = model.roots[0].children[0].children[0].children[0];
    expect(level4.chapter.id).toBe('l4');
    expect(level4.children).toEqual([]);
    expect(model.visiblePathByChapterId.get('l6')).toEqual(['l1', 'l2', 'l3', 'l4']);
  });

  it('把孤儿和循环中不可达的节点降级为根且不无限递归', () => {
    const model = buildOutlineModel([
      chapter('orphan', 'missing', 0),
      chapter('a', 'b', 1),
      chapter('b', 'a', 2),
    ]);

    expect(model.roots.map((node) => node.chapter.id)).toContain('orphan');
    expect(model.visiblePathByChapterId.has('a')).toBe(true);
    expect(model.visiblePathByChapterId.has('b')).toBe(true);
  });

  it('空章节返回空树', () => {
    const model = buildOutlineModel([]);
    expect(model.roots).toEqual([]);
    expect([...model.visiblePathByChapterId]).toEqual([]);
  });
});

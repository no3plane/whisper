import { useMemo, useState } from 'react';
import type { Chapter } from '../../../shared/types';
import type { OutlineModel, OutlineNode } from './outlineModel';
import styles from './BookOutline.module.css';

interface BookOutlineProps {
  model: OutlineModel;
  activeChapterId: string | null;
  onNavigate: (chapter: Chapter) => void;
}

export function BookOutline({ model, activeChapterId, onNavigate }: BookOutlineProps) {
  const activePath = useMemo(
    () => (activeChapterId ? (model.visiblePathByChapterId.get(activeChapterId) ?? []) : []),
    [activeChapterId, model],
  );
  const [expandedByUser, setExpandedByUser] = useState<Set<string>>(() => new Set());
  const [collapsedByUser, setCollapsedByUser] = useState<Set<string>>(() => new Set());

  const expanded = useMemo(() => {
    const next = new Set(expandedByUser);
    for (const id of activePath.slice(0, -1)) {
      if (collapsedByUser.has(id)) {
        break;
      }
      next.add(id);
    }
    for (const id of collapsedByUser) {
      next.delete(id);
    }
    return next;
  }, [activePath, collapsedByUser, expandedByUser]);

  const displayedActiveId = useMemo(() => {
    for (const id of activePath) {
      if (collapsedByUser.has(id)) {
        return id;
      }
    }
    return activePath.at(-1) ?? null;
  }, [activePath, collapsedByUser]);

  function toggle(node: OutlineNode) {
    const id = node.chapter.id;
    const willExpand = !expanded.has(id);
    setExpandedByUser((current) => {
      const next = new Set(current);
      if (willExpand) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
    setCollapsedByUser((current) => {
      const next = new Set(current);
      if (willExpand) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function renderNode(node: OutlineNode) {
    const hasChildren = node.children.length > 0;
    const isExpanded = hasChildren && expanded.has(node.chapter.id);
    const isCurrent = displayedActiveId === node.chapter.id;
    return (
      <li className={styles.item} key={node.chapter.id} data-depth={node.depth}>
        <div className={styles.row} data-current={isCurrent || undefined}>
          {hasChildren ? (
            <button
              type="button"
              className={styles.toggle}
              aria-expanded={isExpanded}
              aria-label={`${isExpanded ? '折叠' : '展开'}“${node.chapter.title}”`}
              onClick={() => toggle(node)}
            >
              <span aria-hidden="true">{isExpanded ? '⌄' : '›'}</span>
            </button>
          ) : (
            <span className={styles.togglePlaceholder} aria-hidden="true" />
          )}
          <a
            className={styles.title}
            href={`#${node.chapter.headingBlockId}`}
            aria-current={isCurrent ? 'location' : undefined}
            onClick={(event) => {
              event.preventDefault();
              onNavigate(node.chapter);
            }}
          >
            {node.chapter.title}
          </a>
        </div>
        {isExpanded ? <ul className={styles.children}>{node.children.map(renderNode)}</ul> : null}
      </li>
    );
  }

  return <ul className={styles.root}>{model.roots.map(renderNode)}</ul>;
}

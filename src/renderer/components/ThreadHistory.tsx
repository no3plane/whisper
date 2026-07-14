import { useMemo, useState } from 'react';
import type { ReadingThread } from '../../shared/types';
import styles from './ThreadHistory.module.css';

interface ThreadHistoryProps {
  threads: ReadingThread[];
  onOpen: (threadId: string) => void;
  onDelete: (threadId: string) => void;
  onRetry: (threadId: string) => void;
  retryableThreadIds?: Set<string>;
}

export function ThreadHistory({
  threads,
  onOpen,
  onDelete,
  onRetry,
  retryableThreadIds,
}: ThreadHistoryProps) {
  const [deleting, setDeleting] = useState<ReadingThread | null>(null);
  const sorted = useMemo(
    () =>
      [...threads].sort((left, right) => {
        if (left.status === 'streaming' && right.status !== 'streaming') return -1;
        if (right.status === 'streaming' && left.status !== 'streaming') return 1;
        return right.updatedAt.localeCompare(left.updatedAt);
      }),
    [threads],
  );

  return (
    <section className={styles.history} aria-label="历史会话">
      <ul>
        {sorted.map((thread) => (
          <li key={thread.id}>
            <button onClick={() => onOpen(thread.id)}>{thread.title}</button>
            {thread.status === 'streaming' ? <span>生成中</span> : null}
            {(
              retryableThreadIds ? retryableThreadIds.has(thread.id) : thread.status === 'failed'
            ) ? (
              <button aria-label={`重试“${thread.title}”`} onClick={() => onRetry(thread.id)}>
                重试
              </button>
            ) : null}
            {thread.status !== 'streaming' ? (
              <button aria-label={`删除“${thread.title}”`} onClick={() => setDeleting(thread)}>
                删除
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {deleting ? (
        <div role="dialog" aria-modal="true" aria-label="确认删除会话">
          <p>确定删除“{deleting.title}”吗？</p>
          <button onClick={() => setDeleting(null)}>取消</button>
          <button
            onClick={() => {
              onDelete(deleting.id);
              setDeleting(null);
            }}
          >
            确认删除
          </button>
        </div>
      ) : null}
    </section>
  );
}

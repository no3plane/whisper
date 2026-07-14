import { Dialog } from '@base-ui/react/dialog';
import { useMemo, useState } from 'react';
import type { ReadingThread } from '../../../shared/types';
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
        if (left.status === 'streaming' && right.status !== 'streaming') {
          return -1;
        }
        if (right.status === 'streaming' && left.status !== 'streaming') {
          return 1;
        }
        return right.updatedAt.localeCompare(left.updatedAt);
      }),
    [threads],
  );

  return (
    <Dialog.Root
      open={Boolean(deleting)}
      onOpenChange={(open) => {
        if (!open) {
          setDeleting(null);
        }
      }}
    >
      <section className={styles.history} aria-label="历史会话">
        {sorted.length === 0 ? <p className={styles.empty}>还没有历史会话</p> : null}
        <ul className={styles.list}>
          {sorted.map((thread) => (
            <li className={styles.item} key={thread.id}>
              <button className={styles.openButton} onClick={() => onOpen(thread.id)}>
                {thread.title}
              </button>
              {thread.status === 'streaming' ? (
                <span className={styles.streaming}>生成中</span>
              ) : null}
              {(
                retryableThreadIds ? retryableThreadIds.has(thread.id) : thread.status === 'failed'
              ) ? (
                <button
                  className={styles.retryButton}
                  aria-label={`重试“${thread.title}”`}
                  onClick={() => onRetry(thread.id)}
                >
                  重试
                </button>
              ) : null}
              {thread.status !== 'streaming' ? (
                <Dialog.Trigger
                  className={styles.deleteButton}
                  aria-label={`删除“${thread.title}”`}
                  onClick={() => setDeleting(thread)}
                >
                  删除
                </Dialog.Trigger>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
      <Dialog.Portal>
        <Dialog.Backdrop className={styles.backdrop} />
        <Dialog.Popup className={styles.dialog} aria-label="确认删除会话">
          <Dialog.Title className={styles.dialogTitle}>确认删除会话</Dialog.Title>
          <Dialog.Description className={styles.dialogDescription}>
            确定删除“{deleting?.title}”吗？此操作无法撤销。
          </Dialog.Description>
          <div className={styles.dialogActions}>
            <Dialog.Close>取消</Dialog.Close>
            <button
              className={styles.dangerButton}
              onClick={() => {
                if (deleting) {
                  onDelete(deleting.id);
                  setDeleting(null);
                }
              }}
            >
              确认删除
            </button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

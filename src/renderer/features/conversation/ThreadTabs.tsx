import type { AiPanelView, ThreadItem } from './conversationWorkspace';
import styles from './RightAiPanel.module.css';

interface ThreadTabsProps {
  activeView: AiPanelView;
  openThreads: ThreadItem[];
  onOpenDraft(): void;
  onSelectThread(threadId: string): void;
  onCloseThread(threadId: string): void;
  onOpenHistory(): void;
}

export function ThreadTabs(props: ThreadTabsProps) {
  return (
    <nav className={styles.tabs} aria-label="打开的会话">
      <div className={styles.tabsScroll}>
        {props.activeView?.type === 'draft' ? (
          <button className={styles.active} onClick={props.onOpenDraft}>
            新会话
          </button>
        ) : null}
        {props.openThreads.map(({ thread }) => (
          <span className={styles.threadTab} key={thread.id}>
            <button
              className={
                props.activeView?.type === 'thread' && props.activeView.threadId === thread.id
                  ? styles.active
                  : undefined
              }
              onClick={() => props.onSelectThread(thread.id)}
            >
              {thread.title}
              {thread.status === 'streaming' ? ' ·' : ''}
            </button>
            <button
              aria-label={`关闭“${thread.title}”`}
              onClick={() => props.onCloseThread(thread.id)}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <button aria-label="新建会话" onClick={props.onOpenDraft}>
        +
      </button>
      <button onClick={props.onOpenHistory}>历史</button>
    </nav>
  );
}

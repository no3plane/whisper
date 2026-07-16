import type { ContextStrategy, MessageReference, ReadingTarget } from '../../../shared/types';
import { BookCognitionMenu } from './BookCognitionMenu';
import type { ConversationDraft } from './draftState';
import type { ThreadItem } from './conversationWorkspace';
import type { ConversationController } from './useConversationWorkspace';
import { DraftComposer } from './DraftComposer';
import { ThreadChat } from './ThreadChat';
import { ThreadHistory } from './ThreadHistory';
import { ThreadTabs } from './ThreadTabs';
import styles from './RightAiPanel.module.css';

export type { AiPanelView } from './conversationWorkspace';

export interface DraftController {
  value: ConversationDraft;
  open(): void;
  update(draft: ConversationDraft): void;
  selectTarget(target: ConversationDraft['target']): void;
}

export interface RightAiPanelProps {
  conversation: ConversationController;
  draft: DraftController;
  targetOptions: ReadingTarget[];
  bookTitle: string;
  contextStrategy: ContextStrategy;
  onContextStrategyChange(strategy: ContextStrategy): Promise<void>;
  onLocate: (threadId: string, reference?: MessageReference | null) => void;
}

export function RightAiPanel({
  conversation,
  draft,
  targetOptions,
  bookTitle,
  contextStrategy,
  onContextStrategyChange,
  onLocate,
}: RightAiPanelProps) {
  const { workspace, commands } = conversation;
  const openThreads = workspace.openThreadIds
    .map((id) => workspace.threads.find((item) => item.thread.id === id))
    .filter((item): item is ThreadItem => Boolean(item));
  const activeThreadId =
    workspace.activeView?.type === 'thread' ? workspace.activeView.threadId : null;
  const active = activeThreadId
    ? (workspace.threads.find((item) => item.thread.id === activeThreadId) ?? null)
    : null;

  return (
    <aside className={styles.panel} aria-label="书旁低语">
      <div className={styles.panelTop}>
        <ThreadTabs
          activeView={workspace.activeView}
          openThreads={openThreads}
          onOpenDraft={draft.open}
          onSelectThread={commands.selectThread}
          onCloseThread={commands.closeThread}
          onOpenHistory={() => commands.selectView({ type: 'history' })}
        />
        <BookCognitionMenu
          bookTitle={bookTitle}
          value={contextStrategy}
          onChange={onContextStrategyChange}
        />
      </div>
      {workspace.activeView?.type === 'draft' ? (
        <DraftComposer
          draft={draft.value}
          targetOptions={targetOptions}
          onUpdate={draft.update}
          onSelectTarget={draft.selectTarget}
          onCreate={commands.createConversation}
        />
      ) : active ? (
        <ThreadChat
          item={active}
          onFollowUp={commands.followUp}
          onRetryMessage={(threadId, messageId) => void commands.retryMessage(threadId, messageId)}
          onLocate={onLocate}
        />
      ) : workspace.activeView?.type === 'history' ? (
        <ThreadHistory
          threads={workspace.threads.map(({ thread }) => thread)}
          onOpen={commands.openThread}
          onDelete={(threadId) => void commands.deleteThread(threadId)}
          onRetry={(threadId) => {
            const failed = workspace.threads
              .find((item) => item.thread.id === threadId)
              ?.messages.find(
                (message) => message.role === 'assistant' && message.status === 'failed',
              );
            if (failed) {
              void commands.retryMessage(threadId, failed.id);
            }
          }}
          retryableThreadIds={
            new Set(
              workspace.threads
                .filter((item) =>
                  item.messages.some(
                    (message) => message.role === 'assistant' && message.status === 'failed',
                  ),
                )
                .map((item) => item.thread.id),
            )
          }
        />
      ) : (
        <div className={styles.panelBody}>
          <p className="muted">新建会话，或从历史记录继续阅读。</p>
        </div>
      )}
    </aside>
  );
}

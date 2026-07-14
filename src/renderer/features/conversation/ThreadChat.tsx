import { useCallback, useMemo } from 'react';
import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  ThreadPrimitive,
  useExternalStoreRuntime,
  type AppendMessage,
  type ThreadMessageLike,
} from '@assistant-ui/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { MessageReference, ThreadMessage } from '../../../shared/types';
import type { ThreadItem } from './conversationWorkspace';
import type { ConversationCommands } from './useConversationWorkspace';
import '@assistant-ui/react-markdown/styles/dot.css';
import styles from './RightAiPanel.module.css';

interface ThreadChatProps {
  item: ThreadItem;
  pendingReference: MessageReference | null;
  onFollowUp: ConversationCommands['followUp'];
  onClearReference(): void;
  onRetryMessage(threadId: string, messageId: string): void;
  onLocate(threadId: string, reference?: MessageReference | null): void;
}

export function ThreadChat({
  item,
  pendingReference,
  onFollowUp,
  onClearReference,
  onRetryMessage,
  onLocate,
}: ThreadChatProps) {
  const messages = useMemo(() => item.messages.map(toMessageLike), [item.messages]);
  const onNew = useCallback(
    async (message: AppendMessage) => {
      const part = message.content[0];
      if (!part || part.type !== 'text') throw new Error('当前只支持文本追问。');
      const question = part.text.trim();
      if (!question)
        throw new Error(pendingReference ? '引用原文后，请输入你的问题。' : '请输入追问内容。');
      await onFollowUp(item.thread.id, question, pendingReference);
      if (pendingReference) onClearReference();
    },
    [item.thread.id, onClearReference, onFollowUp, pendingReference],
  );
  const runtime = useExternalStoreRuntime({
    isRunning: item.thread.status === 'streaming',
    messages,
    convertMessage: (message) => message,
    onNew,
  });
  const streamError =
    item.messages.find((message) => message.status === 'failed')?.error ??
    item.thread.lastError ??
    undefined;
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className={styles.threadChat}>
        <header>
          <p className="muted">全书认知：{item.thread.contextStrategy}</p>
          <button onClick={() => onLocate(item.thread.id)}>回到原文</button>
        </header>
        {streamError ? <p className="error">{streamError}</p> : null}
        <ThreadPrimitive.Root className={styles.threadRoot}>
          <ThreadPrimitive.Viewport className={styles.threadViewport} autoScroll>
            <div>
              {item.messages
                .filter((message) => message.role !== 'system')
                .map((message) => (
                  <article className={styles.message} key={message.id}>
                    <div className={styles.messageLabel}>
                      {message.role === 'user' ? '你' : '助手'}
                    </div>
                    {message.reference ? (
                      <button onClick={() => onLocate(item.thread.id, message.reference)}>
                        引用：{message.reference.breadcrumb.map((crumb) => crumb.title).join(' > ')}
                      </button>
                    ) : null}
                    <div className={`${styles.messageBody} ${styles.markdown}`}>
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                    </div>
                    {message.status === 'failed' ? (
                      <button onClick={() => onRetryMessage(item.thread.id, message.id)}>
                        重试回答
                      </button>
                    ) : null}
                  </article>
                ))}
              {item.thread.status === 'streaming' ? (
                <div className={styles.thinkingStatus} aria-live="polite">
                  模型思考中…
                </div>
              ) : null}
            </div>
            <ThreadPrimitive.ViewportFooter>
              {pendingReference ? (
                <aside className={styles.pendingReference}>
                  <span>{pendingReference.breadcrumb.map((crumb) => crumb.title).join(' > ')}</span>
                  <blockquote>{pendingReference.selectedText}</blockquote>
                  <button aria-label="移除引用" onClick={onClearReference}>
                    ×
                  </button>
                </aside>
              ) : null}
              <ComposerPrimitive.Root className={styles.composer}>
                <ComposerPrimitive.Input
                  className={styles.composerInput}
                  placeholder={pendingReference ? '结合这段文字追问什么？' : '继续追问这个回答'}
                  rows={1}
                />
                <ComposerPrimitive.Send className={styles.composerSend} aria-label="发送追问">
                  发送
                </ComposerPrimitive.Send>
              </ComposerPrimitive.Root>
            </ThreadPrimitive.ViewportFooter>
          </ThreadPrimitive.Viewport>
        </ThreadPrimitive.Root>
      </div>
    </AssistantRuntimeProvider>
  );
}

function toMessageLike(message: ThreadMessage): ThreadMessageLike {
  return {
    id: message.id,
    role: message.role,
    content: [{ type: 'text', text: message.content }],
    createdAt: new Date(message.createdAt),
  };
}

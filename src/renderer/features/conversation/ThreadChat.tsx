import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { MessageReference } from '../../../shared/types';
import type { ThreadItem } from './conversationWorkspace';
import type { ConversationCommands } from './useConversationWorkspace';
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
  const [question, setQuestion] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const isRunning = item.thread.status === 'streaming';
  const canSend = question.trim().length > 0 && !isRunning && !isSubmitting;

  useEffect(() => {
    if (!stickToBottomRef.current) return;
    const viewport = viewportRef.current;
    if (viewport) viewport.scrollTo({ top: viewport.scrollHeight });
  }, [item.messages, item.thread.status]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const nextQuestion = question.trim();
    if (!nextQuestion || isRunning || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onFollowUp(item.thread.id, nextQuestion, pendingReference);
      setQuestion('');
      if (pendingReference) onClearReference();
    } catch {
      // The conversation controller reports the error; keep the draft available for retry.
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  function handleScroll() {
    const viewport = viewportRef.current;
    if (!viewport) return;
    stickToBottomRef.current =
      viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= 48;
  }

  const streamError =
    item.messages.find((message) => message.status === 'failed')?.error ??
    item.thread.lastError ??
    undefined;
  return (
    <div className={styles.threadChat}>
      <header>
        <p className="muted">全书认知：{item.thread.contextStrategy}</p>
        <button onClick={() => onLocate(item.thread.id)}>回到原文</button>
      </header>
      {streamError ? <p className="error">{streamError}</p> : null}
      <div className={styles.threadRoot}>
        <div className={styles.threadViewport} ref={viewportRef} onScroll={handleScroll}>
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
          <div>
            {pendingReference ? (
              <aside className={styles.pendingReference}>
                <span>{pendingReference.breadcrumb.map((crumb) => crumb.title).join(' > ')}</span>
                <blockquote>{pendingReference.selectedText}</blockquote>
                <button aria-label="移除引用" onClick={onClearReference}>
                  ×
                </button>
              </aside>
            ) : null}
            <form className={styles.composer} onSubmit={submit}>
              <textarea
                className={styles.composerInput}
                placeholder={pendingReference ? '结合这段文字追问什么？' : '继续追问这个回答'}
                rows={1}
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                onKeyDown={handleKeyDown}
              />
              <button className={styles.composerSend} aria-label="发送追问" disabled={!canSend}>
                发送
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

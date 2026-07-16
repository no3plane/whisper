import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { labelForSkill } from '../../../shared/skills';
import type { MessageReference } from '../../../shared/types';
import type { ThreadItem } from './conversationWorkspace';
import { targetLabel } from './targetOptions';
import type { ConversationCommands } from './useConversationWorkspace';
import styles from './RightAiPanel.module.css';

interface ThreadChatProps {
  item: ThreadItem;
  onFollowUp: ConversationCommands['followUp'];
  onRetryMessage(threadId: string, messageId: string): void;
  onLocate(threadId: string, reference?: MessageReference | null): void;
}

export function ThreadChat({ item, onFollowUp, onRetryMessage, onLocate }: ThreadChatProps) {
  const [question, setQuestion] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const isRunning = item.thread.status === 'streaming';
  const canSend = question.trim().length > 0 && !isRunning && !isSubmitting;

  useEffect(() => {
    if (!stickToBottomRef.current) {
      return;
    }
    const viewport = viewportRef.current;
    if (viewport) {
      viewport.scrollTo({ top: viewport.scrollHeight });
    }
  }, [item.messages, item.thread.status]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const nextQuestion = question.trim();
    if (!nextQuestion || isRunning || isSubmitting) {
      return;
    }
    setIsSubmitting(true);
    try {
      await onFollowUp(item.thread.id, nextQuestion);
      setQuestion('');
    } catch {
      // The conversation controller reports the error; keep the draft available for retry.
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) {
      return;
    }
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  function handleScroll() {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }
    stickToBottomRef.current =
      viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= 48;
  }

  const streamError =
    item.messages.find((message) => message.status === 'failed')?.error ??
    item.thread.lastError ??
    undefined;
  return (
    <div className={styles.threadChat}>
      <header className={styles.threadTaskSummary} aria-label="当前解读任务">
        {item.thread.target.type === 'book' ? (
          <span className={styles.threadTarget}>{targetLabel(item.thread.target)}</span>
        ) : (
          <button className={styles.threadTarget} onClick={() => onLocate(item.thread.id)}>
            {targetLabel(item.thread.target)} ↗
          </button>
        )}
        <span aria-hidden>·</span>
        <span>{item.thread.skillType ? labelForSkill(item.thread.skillType) : '自由提问'}</span>
        <span className={styles.readOnly}>只读</span>
      </header>
      {streamError ? <p className="error">{streamError}</p> : null}
      <div className={styles.threadRoot}>
        <div className={styles.threadViewport} ref={viewportRef} onScroll={handleScroll}>
          {item.messages
            .filter((message) => message.role !== 'system')
            .map((message) => (
              <article
                className={`${styles.message} ${message.role === 'user' ? styles.userMessage : ''}`}
                key={message.id}
              >
                <div className={styles.messageLabel}>{message.role === 'user' ? '你' : '助手'}</div>
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
        <div className={styles.threadComposerArea}>
          <form className={styles.composer} onSubmit={submit}>
            <textarea
              className={styles.composerInput}
              placeholder="继续追问……"
              rows={1}
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={handleKeyDown}
            />
            <button className={styles.composerSend} aria-label="发送追问" disabled={!canSend}>
              ↑
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

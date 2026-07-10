import { useCallback, useMemo, type FC } from 'react';
import {
  AssistantRuntimeProvider,
  AuiIf,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useExternalStoreRuntime,
  type AppendMessage,
  type ThreadMessageLike,
} from '@assistant-ui/react';
import { MarkdownTextPrimitive } from '@assistant-ui/react-markdown';
import remarkGfm from 'remark-gfm';
import type { ReadingThread, ThreadMessage } from '../../shared/types';
import '@assistant-ui/react-markdown/styles/dot.css';

interface RightAiPanelProps {
  threads: Array<{ thread: ReadingThread; messages: ThreadMessage[] }>;
  activeThreadId: string | null;
  onSelectThread: (threadId: string | null) => void;
  onFollowUp: (threadId: string, question: string) => Promise<void>;
  streamError?: string;
}

function toThreadMessageLike(message: ThreadMessage): ThreadMessageLike {
  return {
    id: message.id,
    role: message.role,
    content: [{ type: 'text', text: message.content }],
    createdAt: new Date(message.createdAt),
  };
}

export function RightAiPanel({
  threads,
  activeThreadId,
  onSelectThread,
  onFollowUp,
  streamError,
}: RightAiPanelProps) {
  const active = threads.find((item) => item.thread.id === activeThreadId) ?? null;

  return (
    <aside className="right-panel">
      <div className="tabs">
        {threads.map((item) => (
          <button
            key={item.thread.id}
            className={activeThreadId === item.thread.id ? 'active' : ''}
            onClick={() => onSelectThread(item.thread.id)}
          >
            {item.thread.title}
            {item.thread.status === 'streaming' ? ' ·' : ''}
          </button>
        ))}
      </div>
      {active ? (
        <ThreadChat item={active} onFollowUp={onFollowUp} streamError={streamError} />
      ) : <div className="panel-body"><p className="muted">选中原文并选择一个阅读动作。</p></div>}
    </aside>
  );
}

function ThreadChat({
  item,
  onFollowUp,
  streamError,
}: {
  item: { thread: ReadingThread; messages: ThreadMessage[] };
  onFollowUp: (threadId: string, question: string) => Promise<void>;
  streamError?: string;
}) {
  const isRunning = item.thread.status === 'streaming';
  const messages = useMemo(() => item.messages.map(toThreadMessageLike), [item.messages]);

  const onNew = useCallback(
    async (message: AppendMessage) => {
      const part = message.content[0];
      if (!part || part.type !== 'text') {
        throw new Error('当前只支持文本追问。');
      }
      const question = part.text.trim();
      if (!question) return;
      await onFollowUp(item.thread.id, question);
    },
    [item.thread.id, onFollowUp],
  );

  const runtime = useExternalStoreRuntime({
    isRunning,
    messages,
    convertMessage: (message) => message,
    onNew,
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="thread-chat">
        <p className="muted">上下文策略：{item.thread.contextStrategy}</p>
        <blockquote className="selected-quote">{item.thread.selectedText}</blockquote>
        {streamError ? <p className="error">{streamError}</p> : null}
        <ThreadPrimitive.Root className="aui-thread-root">
          <ThreadPrimitive.Viewport className="aui-thread-viewport" autoScroll>
            <ThreadPrimitive.Messages>
              {({ message }) => (message.role === 'user' ? <UserMessage /> : <AssistantMessage />)}
            </ThreadPrimitive.Messages>
            <AuiIf condition={(s) => s.thread.isRunning}>
              <div className="thinking-status" aria-live="polite">
                <span className="thinking-dot" />
                模型思考中…
              </div>
            </AuiIf>
            <ThreadPrimitive.ViewportFooter>
              <Composer />
            </ThreadPrimitive.ViewportFooter>
          </ThreadPrimitive.Viewport>
        </ThreadPrimitive.Root>
      </div>
    </AssistantRuntimeProvider>
  );
}

const UserMessage: FC = () => (
  <MessagePrimitive.Root className="aui-message aui-message-user">
    <div className="aui-message-label">你</div>
    <div className="aui-message-body">
      <MessagePrimitive.Parts>
        {({ part }) => (part.type === 'text' ? <p className="aui-user-text">{part.text}</p> : null)}
      </MessagePrimitive.Parts>
    </div>
  </MessagePrimitive.Root>
);

const AssistantMessage: FC = () => (
  <MessagePrimitive.Root className="aui-message aui-message-assistant">
    <div className="aui-message-label">助手</div>
    <div className="aui-message-body aui-markdown">
      <MessagePrimitive.Parts>
        {({ part }) =>
          part.type === 'text' ? (
            <MarkdownTextPrimitive remarkPlugins={[remarkGfm]} smooth className="aui-md" />
          ) : null
        }
      </MessagePrimitive.Parts>
      <MessagePrimitive.Error>
        <p className="error">回答失败，请重试。</p>
      </MessagePrimitive.Error>
    </div>
  </MessagePrimitive.Root>
);

const Composer: FC = () => (
  <ComposerPrimitive.Root className="aui-composer">
    <ComposerPrimitive.Input className="aui-composer-input" placeholder="继续追问这个回答" rows={1} />
    <div className="aui-composer-actions">
      <AuiIf condition={(s) => !s.thread.isRunning}>
        <ComposerPrimitive.Send className="aui-composer-send">发送</ComposerPrimitive.Send>
      </AuiIf>
      <AuiIf condition={(s) => s.thread.isRunning}>
        <ComposerPrimitive.Cancel className="aui-composer-cancel" disabled>
          生成中
        </ComposerPrimitive.Cancel>
      </AuiIf>
    </div>
  </ComposerPrimitive.Root>
);

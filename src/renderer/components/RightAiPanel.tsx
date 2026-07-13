import { useCallback, useMemo, type FormEvent } from 'react';
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
import type { CreateConversationInput, MessageReference, ReadingThread, ThreadMessage } from '../../shared/types';
import type { ConversationDraft } from '../chat/draftState';
import { validateDraft } from '../chat/draftState';
import { ThreadHistory } from './ThreadHistory';
import { TargetPicker } from './TargetPicker';
import '@assistant-ui/react-markdown/styles/dot.css';

type ThreadItem = { thread: ReadingThread; messages: ThreadMessage[] };
export type AiPanelView = { type: 'draft' } | { type: 'thread'; threadId: string } | { type: 'history' } | null;

export interface RightAiPanelProps {
  threads: ThreadItem[];
  historyThreads: ReadingThread[];
  openThreadIds: string[];
  activeView: AiPanelView;
  draft: ConversationDraft;
  pendingReference: MessageReference | null;
  onOpenDraft: () => void;
  onUpdateDraft: (draft: ConversationDraft) => void;
  onSelectDraftTarget?: (target: ConversationDraft['target']) => void;
  onCreate: (input: CreateConversationInput) => Promise<void>;
  onSelectThread: (threadId: string) => void;
  onCloseThread: (threadId: string) => void;
  onOpenHistory: () => void;
  onOpenThread: (threadId: string) => void;
  onDeleteThread: (threadId: string) => void;
  onRetryThread: (threadId: string) => void;
  onFollowUp: (threadId: string, question: string, reference: MessageReference | null) => Promise<void>;
  onClearReference: () => void;
  onRetryMessage: (threadId: string, messageId: string) => void;
  onLocate: (threadId: string, reference?: MessageReference | null) => void;
  retryableThreadIds?: Set<string>;
  streamError?: string;
}

export function RightAiPanel(props: RightAiPanelProps) {
  const openThreads = props.openThreadIds
    .map((id) => props.threads.find((item) => item.thread.id === id))
    .filter((item): item is ThreadItem => Boolean(item));
  const activeThreadId = props.activeView?.type === 'thread' ? props.activeView.threadId : null;
  const active = activeThreadId
    ? props.threads.find((item) => item.thread.id === activeThreadId) ?? null
    : null;

  return (
    <aside className="right-panel">
      <ThreadTabs {...props} openThreads={openThreads} />
      {props.activeView?.type === 'draft' ? (
        <DraftComposer draft={props.draft} onUpdate={props.onUpdateDraft}
          onSelectTarget={props.onSelectDraftTarget ?? ((target) => props.onUpdateDraft({ ...props.draft, target }))} onCreate={props.onCreate} />
      ) : active ? (
        <ThreadChat item={active} pendingReference={props.pendingReference} onFollowUp={props.onFollowUp}
          onClearReference={props.onClearReference} onRetryMessage={props.onRetryMessage}
          onLocate={props.onLocate} streamError={props.streamError} />
      ) : props.activeView?.type === 'history' ? (
        <ThreadHistory threads={props.historyThreads} onOpen={props.onOpenThread}
          onDelete={props.onDeleteThread} onRetry={props.onRetryThread} retryableThreadIds={props.retryableThreadIds} />
      ) : (
        <div className="panel-body"><p className="muted">新建会话，或从历史记录继续阅读。</p></div>
      )}
    </aside>
  );
}

function ThreadTabs(props: RightAiPanelProps & { openThreads: ThreadItem[] }) {
  return (
    <nav className="tabs" aria-label="打开的会话">
      <div className="tabs-scroll">
        {props.activeView?.type === 'draft' ? <button className="active" onClick={props.onOpenDraft}>新会话</button> : null}
        {props.openThreads.map(({ thread }) => (
          <span className="thread-tab" key={thread.id}>
            <button className={props.activeView?.type === 'thread' && props.activeView.threadId === thread.id ? 'active' : ''}
              onClick={() => props.onSelectThread(thread.id)}>
              {thread.title}{thread.status === 'streaming' ? ' ·' : ''}
            </button>
            <button aria-label={`关闭“${thread.title}”`} onClick={() => props.onCloseThread(thread.id)}>×</button>
          </span>
        ))}
      </div>
      <button aria-label="新建会话" onClick={props.onOpenDraft}>+</button>
      <button onClick={props.onOpenHistory}>历史</button>
    </nav>
  );
}

function DraftComposer({ draft, onUpdate, onSelectTarget, onCreate }: { draft: ConversationDraft; onUpdate: (draft: ConversationDraft) => void; onSelectTarget: (target: ConversationDraft['target']) => void; onCreate: (input: CreateConversationInput) => Promise<void> }) {
  const validation = validateDraft(draft);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!validation.valid) return;
    await onCreate({ bookId: draft.bookId, target: draft.target, skillType: draft.skillType, prompt: draft.prompt.trim(), contextStrategy: draft.contextStrategy });
  }
  return (
    <form className="draft-composer panel-body" onSubmit={(event) => void submit(event)}>
      <h3>新会话</h3>
      <TargetPicker draft={draft}
        onTargetChange={onSelectTarget}
        onSkillChange={(skillType) => onUpdate({ ...draft, skillType })}
        onStrategyChange={(contextStrategy) => onUpdate({ ...draft, contextStrategy, strategySource: 'draft-override' })} />
      <textarea value={draft.prompt} onChange={(event) => onUpdate({ ...draft, prompt: event.target.value })}
        placeholder={draft.skillType ? '可补充具体要求，也可以直接发送' : '你想了解什么？'} />
      <button type="submit" aria-label="发送首次问题" disabled={!validation.valid}>发送</button>
    </form>
  );
}

function toMessageLike(message: ThreadMessage): ThreadMessageLike {
  return { id: message.id, role: message.role, content: [{ type: 'text', text: message.content }], createdAt: new Date(message.createdAt) };
}

function ThreadChat({ item, pendingReference, onFollowUp, onClearReference, onRetryMessage, onLocate, streamError }: {
  item: ThreadItem;
  pendingReference: MessageReference | null;
  onFollowUp: RightAiPanelProps['onFollowUp'];
  onClearReference: () => void;
  onRetryMessage: RightAiPanelProps['onRetryMessage'];
  onLocate: RightAiPanelProps['onLocate'];
  streamError?: string;
}) {
  const messages = useMemo(() => item.messages.map(toMessageLike), [item.messages]);
  const onNew = useCallback(async (message: AppendMessage) => {
    const part = message.content[0];
    if (!part || part.type !== 'text') throw new Error('当前只支持文本追问。');
    const question = part.text.trim();
    if (!question) throw new Error(pendingReference ? '引用原文后，请输入你的问题。' : '请输入追问内容。');
    await onFollowUp(item.thread.id, question, pendingReference);
    if (pendingReference) onClearReference();
  }, [item.thread.id, onClearReference, onFollowUp, pendingReference]);
  const runtime = useExternalStoreRuntime({ isRunning: item.thread.status === 'streaming', messages, convertMessage: (message) => message, onNew });
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="thread-chat">
        <header className="thread-context">
          <p className="muted">全书认知：{item.thread.contextStrategy}</p>
          <button onClick={() => onLocate(item.thread.id)}>回到原文</button>
        </header>
        {streamError ? <p className="error">{streamError}</p> : null}
        <ThreadPrimitive.Root className="aui-thread-root">
          <ThreadPrimitive.Viewport className="aui-thread-viewport" autoScroll>
            <div className="thread-messages">
              {item.messages.filter((message) => message.role !== 'system').map((message) => (
                <article className={`aui-message aui-message-${message.role}`} key={message.id}>
                  <div className="aui-message-label">{message.role === 'user' ? '你' : '助手'}</div>
                  {message.reference ? <button onClick={() => onLocate(item.thread.id, message.reference)}>引用：{message.reference.breadcrumb.map((crumb) => crumb.title).join(' > ')}</button> : null}
                  <div className="aui-message-body aui-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown></div>
                  {message.status === 'failed' ? <button onClick={() => onRetryMessage(item.thread.id, message.id)}>重试回答</button> : null}
                </article>
              ))}
              {item.thread.status === 'streaming' ? <div className="thinking-status" aria-live="polite">模型思考中…</div> : null}
            </div>
            <ThreadPrimitive.ViewportFooter>
              {pendingReference ? <aside className="pending-reference"><span>{pendingReference.breadcrumb.map((crumb) => crumb.title).join(' > ')}</span><blockquote>{pendingReference.selectedText}</blockquote><button aria-label="移除引用" onClick={onClearReference}>×</button></aside> : null}
              <ComposerPrimitive.Root className="aui-composer">
                <ComposerPrimitive.Input className="aui-composer-input" placeholder={pendingReference ? '结合这段文字追问什么？' : '继续追问这个回答'} rows={1} />
                <ComposerPrimitive.Send className="aui-composer-send" aria-label="发送追问">发送</ComposerPrimitive.Send>
              </ComposerPrimitive.Root>
            </ThreadPrimitive.ViewportFooter>
          </ThreadPrimitive.Viewport>
        </ThreadPrimitive.Root>
      </div>
    </AssistantRuntimeProvider>
  );
}

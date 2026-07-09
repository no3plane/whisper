import type { FormEvent } from 'react';
import type { ReadingThread, ThreadMessage } from '../../shared/types';

interface RightAiPanelProps {
  threads: Array<{ thread: ReadingThread; messages: ThreadMessage[] }>;
  activeThreadId: string | null;
  onSelectThread: (threadId: string | null) => void;
  onFollowUp: (threadId: string, question: string) => Promise<void>;
}

export function RightAiPanel({ threads, activeThreadId, onSelectThread, onFollowUp }: RightAiPanelProps) {
  const active = threads.find((item) => item.thread.id === activeThreadId) ?? null;

  return (
    <aside className="right-panel">
      <div className="tabs">
        <button className={activeThreadId === null ? 'active' : ''} onClick={() => onSelectThread(null)}>
          问题地图
        </button>
        {threads.map((item) => (
          <button
            key={item.thread.id}
            className={activeThreadId === item.thread.id ? 'active' : ''}
            onClick={() => onSelectThread(item.thread.id)}
          >
            {item.thread.title}
          </button>
        ))}
      </div>
      {active ? (
        <ThreadView item={active} onFollowUp={onFollowUp} />
      ) : (
        <div className="panel-body">
          <h3>问题地图</h3>
          <p className="muted">纵向切片阶段暂未生成问题地图。下一阶段会在导入后生成全书问题地图。</p>
        </div>
      )}
    </aside>
  );
}

function ThreadView({
  item,
  onFollowUp,
}: {
  item: { thread: ReadingThread; messages: ThreadMessage[] };
  onFollowUp: (threadId: string, question: string) => Promise<void>;
}) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const question = String(data.get('question') ?? '').trim();
    if (!question) return;
    form.reset();
    await onFollowUp(item.thread.id, question);
  }

  return (
    <div className="panel-body">
      <p className="muted">上下文策略：{item.thread.contextStrategy}</p>
      <blockquote>{item.thread.selectedText}</blockquote>
      <div className="messages">
        {item.messages.map((message) => (
          <div className={`message ${message.role}`} key={message.id}>
            <strong>{message.role}</strong>
            <p>{message.content}</p>
          </div>
        ))}
      </div>
      <form onSubmit={submit} className="follow-up">
        <input name="question" placeholder="继续追问这个回答" />
        <button>发送</button>
      </form>
    </div>
  );
}

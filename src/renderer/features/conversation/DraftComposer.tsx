import type { FormEvent } from 'react';
import type { CreateConversationInput } from '../../../shared/types';
import type { ConversationDraft } from './draftState';
import { validateDraft } from './draftState';
import { ContextStrategyPicker, TargetPicker } from './TargetPicker';
import styles from './RightAiPanel.module.css';

interface DraftComposerProps {
  draft: ConversationDraft;
  onUpdate(draft: ConversationDraft): void;
  onSelectTarget(target: ConversationDraft['target']): void;
  onCreate(input: CreateConversationInput): Promise<void>;
}

export function DraftComposer({ draft, onUpdate, onSelectTarget, onCreate }: DraftComposerProps) {
  const validation = validateDraft(draft);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!validation.valid) {
      return;
    }
    await onCreate({
      bookId: draft.bookId,
      target: draft.target,
      skillType: draft.skillType,
      prompt: draft.prompt.trim(),
      contextStrategy: draft.contextStrategy,
    });
  }
  return (
    <form className={styles.draftLayout} onSubmit={(event) => void submit(event)}>
      <section className={styles.draftViewport} aria-label="新会话内容">
        <h3>新会话</h3>
      </section>
      <div className={styles.draftComposer} role="group" aria-label="新会话输入区">
        <TargetPicker
          draft={draft}
          onTargetChange={onSelectTarget}
          onSkillChange={(skillType) => onUpdate({ ...draft, skillType })}
        />
        <ContextStrategyPicker
          value={draft.contextStrategy}
          onChange={(contextStrategy) =>
            onUpdate({ ...draft, contextStrategy, strategySource: 'draft-override' })
          }
        />
        <textarea
          value={draft.prompt}
          onChange={(event) => onUpdate({ ...draft, prompt: event.target.value })}
          placeholder={draft.skillType ? '可补充具体要求，也可以直接发送' : '你想了解什么？'}
        />
        <button type="submit" aria-label="发送首次问题" disabled={!validation.valid}>
          发送
        </button>
      </div>
    </form>
  );
}

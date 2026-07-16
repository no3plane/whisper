import { useState, type FormEvent } from 'react';
import type { CreateConversationInput, ReadingTarget } from '../../../shared/types';
import type { ConversationDraft } from './draftState';
import { validateDraft } from './draftState';
import { InterpretationMethodPicker } from './InterpretationMethodPicker';
import { TargetPicker } from './TargetPicker';
import styles from './RightAiPanel.module.css';

interface DraftComposerProps {
  draft: ConversationDraft;
  targetOptions: ReadingTarget[];
  onUpdate(draft: ConversationDraft): void;
  onSelectTarget(target: ConversationDraft['target']): void;
  onCreate(input: CreateConversationInput): Promise<void>;
}

export function DraftComposer({
  draft,
  targetOptions,
  onUpdate,
  onSelectTarget,
  onCreate,
}: DraftComposerProps) {
  const [questionFocused, setQuestionFocused] = useState(false);
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
      <div className={styles.taskComposer} role="group" aria-label="新会话输入区">
        <div className={styles.taskRow}>
          <span className={styles.taskLabel}>解读目标</span>
          <TargetPicker draft={draft} options={targetOptions} onTargetChange={onSelectTarget} />
        </div>
        <div className={styles.taskRow}>
          <span className={styles.taskLabel}>解读方式</span>
          <InterpretationMethodPicker
            targetType={draft.target.type}
            value={draft.skillType}
            onChange={(skillType) => onUpdate({ ...draft, skillType })}
          />
        </div>
        <label className={styles.taskRow}>
          <span className={styles.taskLabel}>补充提问</span>
          <textarea
            className={styles.optionalQuestion}
            rows={questionFocused || draft.prompt.trim() ? 3 : 1}
            value={draft.prompt}
            onFocus={() => setQuestionFocused(true)}
            onBlur={() => setQuestionFocused(false)}
            onChange={(event) => onUpdate({ ...draft, prompt: event.target.value })}
            placeholder="还有特别想了解的吗？（可选）"
          />
        </label>
        <div className={styles.taskFooter}>
          {!validation.valid ? <span>请选择解读方式</span> : null}
          <button type="submit" disabled={!validation.valid}>
            开始解读
          </button>
        </div>
      </div>
    </form>
  );
}

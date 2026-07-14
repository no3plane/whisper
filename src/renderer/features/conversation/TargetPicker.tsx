import { useEffect, useRef, useState } from 'react';
import { skillsForTarget } from '../../../shared/skills';
import type { ConversationDraft } from './draftState';
import type { ContextStrategy, ReadingSkillType, ReadingTarget } from '../../../shared/types';
import styles from './TargetPicker.module.css';

interface TargetPickerProps {
  draft: ConversationDraft;
  onTargetChange: (target: ReadingTarget) => void;
  onSkillChange: (skill: ReadingSkillType | null) => void;
  onStrategyChange: (strategy: ContextStrategy) => void;
}

const strategyLabels: Record<ContextStrategy, string> = {
  full_book: '完整全书',
  compressed_book: '压缩全书',
  hybrid: '混合',
};

export function TargetPicker({
  draft,
  onTargetChange,
  onSkillChange,
  onStrategyChange,
}: TargetPickerProps) {
  const previousSkill = useRef(draft.skillType);
  const [skillCleared, setSkillCleared] = useState(false);

  useEffect(() => {
    if (previousSkill.current && !draft.skillType) {
      setSkillCleared(true);
    }
    if (draft.skillType) {
      setSkillCleared(false);
    }
    previousSkill.current = draft.skillType;
  }, [draft.skillType]);

  const selectChapter = (index: number) => {
    const crumb = draft.target.breadcrumb[index];
    onTargetChange({
      type: 'chapter',
      chapterId: crumb.chapterId,
      startPassageId: null,
      endPassageId: null,
      selectedText: '',
      startOffset: null,
      endOffset: null,
      breadcrumb: draft.target.breadcrumb.slice(0, index + 1),
    });
  };

  return (
    <section className={styles.picker} aria-label="解读设置">
      <div className={styles.breadcrumb} aria-label="解读目标">
        {draft.target.type === 'selection' ? (
          <button type="button" aria-pressed>
            框选内容
          </button>
        ) : draft.target.type === 'book' ? (
          <button type="button" aria-pressed>
            整本书
          </button>
        ) : null}
        {draft.target.breadcrumb.map((crumb, index) => (
          <button type="button" key={crumb.chapterId} onClick={() => selectChapter(index)}>
            {crumb.title}
          </button>
        ))}
      </div>

      {draft.target.selectedText ? <blockquote>{draft.target.selectedText}</blockquote> : null}

      <fieldset>
        <legend>技能</legend>
        {skillsForTarget(draft.target.type).map((skill) => (
          <button
            type="button"
            key={skill.id}
            aria-pressed={draft.skillType === skill.id}
            onClick={() => onSkillChange(draft.skillType === skill.id ? null : skill.id)}
          >
            {skill.label}
          </button>
        ))}
      </fieldset>
      {skillCleared ? <p role="status">目标已变化，原技能已清除</p> : null}

      <label>
        全书认知
        <select
          value={draft.contextStrategy}
          onChange={(event) => onStrategyChange(event.target.value as ContextStrategy)}
        >
          {Object.entries(strategyLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
    </section>
  );
}

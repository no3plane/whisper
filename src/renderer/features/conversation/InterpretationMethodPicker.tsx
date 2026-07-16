import { skillsForTarget } from '../../../shared/skills';
import type { ReadingSkillType, ReadingTargetType } from '../../../shared/types';
import styles from './RightAiPanel.module.css';

interface InterpretationMethodPickerProps {
  targetType: ReadingTargetType;
  value: ReadingSkillType | null;
  onChange(value: ReadingSkillType): void;
}

export function InterpretationMethodPicker({
  targetType,
  value,
  onChange,
}: InterpretationMethodPickerProps) {
  return (
    <div className={styles.methodGroup} role="radiogroup" aria-label="解读方式">
      {skillsForTarget(targetType).map((method) => (
        <button
          type="button"
          role="radio"
          aria-checked={value === method.id}
          key={method.id}
          onClick={() => onChange(method.id)}
        >
          {method.label}
        </button>
      ))}
    </div>
  );
}

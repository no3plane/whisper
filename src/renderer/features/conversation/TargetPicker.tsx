import { useEffect, useRef, useState } from 'react';
import type { ReadingTarget } from '../../../shared/types';
import type { ConversationDraft } from './draftState';
import { targetLabel } from './targetOptions';
import styles from './TargetPicker.module.css';

interface TargetPickerProps {
  draft: ConversationDraft;
  options: ReadingTarget[];
  onTargetChange(target: ReadingTarget): void;
}

export function TargetPicker({ draft, options, onTargetChange }: TargetPickerProps) {
  const [open, setOpen] = useState(false);
  const [methodCleared, setMethodCleared] = useState(false);
  const previousMethod = useRef(draft.skillType);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setMethodCleared(Boolean(previousMethod.current && !draft.skillType));
    previousMethod.current = draft.skillType;
  }, [draft.skillType]);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className={styles.picker} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className={styles.targetValue}>
          {targetLabel(draft.target)}
          {draft.target.type === 'selection' ? ` · ${draft.target.selectedText}` : ''}
        </span>
        <span aria-hidden>⌄</span>
      </button>
      {open ? (
        <div className={styles.menu} role="listbox" aria-label="解读目标">
          {options.map((target) => {
            const selected = sameTarget(target, draft.target);
            return (
              <button
                type="button"
                role="option"
                aria-selected={selected}
                key={targetKey(target)}
                onClick={() => {
                  onTargetChange(target);
                  setOpen(false);
                }}
              >
                <span>{targetLabel(target)}</span>
                {target.type === 'selection' ? (
                  <span className={styles.optionExcerpt}>{target.selectedText}</span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
      {methodCleared ? <p role="status">目标已变化，请重新选择解读方式</p> : null}
    </div>
  );
}

function sameTarget(left: ReadingTarget, right: ReadingTarget) {
  return (
    left.type === right.type &&
    left.chapterId === right.chapterId &&
    left.start?.blockId === right.start?.blockId &&
    left.start?.offsetInBlock === right.start?.offsetInBlock
  );
}

function targetKey(target: ReadingTarget) {
  return [
    target.type,
    target.chapterId ?? '',
    target.start?.blockId ?? '',
    target.start?.offsetInBlock ?? '',
  ].join(':');
}

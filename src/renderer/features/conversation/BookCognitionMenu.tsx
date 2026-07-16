import { useEffect, useRef, useState } from 'react';
import type { ContextStrategy } from '../../../shared/types';
import styles from './RightAiPanel.module.css';

const OPTIONS: Array<{
  value: ContextStrategy;
  label: string;
  description: string;
}> = [
  { value: 'full_book', label: '完整全书', description: '尽可能提供原书全文' },
  { value: 'compressed_book', label: '压缩全书', description: '使用压缩后的全书背景' },
  { value: 'hybrid', label: '混合', description: '全书摘要加目标附近原文' },
];

interface BookCognitionMenuProps {
  bookTitle: string;
  value: ContextStrategy;
  onChange(value: ContextStrategy): Promise<void>;
}

export function BookCognitionMenu({ bookTitle, value, onChange }: BookCognitionMenuProps) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

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

  async function change(next: ContextStrategy) {
    if (next === value || saving) {
      setOpen(false);
      return;
    }
    setSaving(true);
    try {
      await onChange(next);
      setOpen(false);
    } catch {
      // Parent owns the visible error; keep the menu open and the controlled value unchanged.
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.cognitionMenu} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.cognitionTrigger}
        aria-label="全书认知设置"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        ⚙
      </button>
      {open ? (
        <div className={styles.cognitionPopover}>
          <header>
            <strong>全书认知</strong>
            <span>{bookTitle}</span>
          </header>
          <div role="radiogroup" aria-label="全书认知">
            {OPTIONS.map((option) => (
              <button
                type="button"
                role="radio"
                aria-checked={option.value === value}
                disabled={saving}
                key={option.value}
                onClick={() => void change(option.value)}
              >
                <span className={styles.cognitionRadio} aria-hidden />
                <span>
                  <strong>{option.label}</strong>
                  <small>{option.description}</small>
                </span>
              </button>
            ))}
          </div>
          <footer>修改只影响之后创建的新会话</footer>
        </div>
      ) : null}
    </div>
  );
}

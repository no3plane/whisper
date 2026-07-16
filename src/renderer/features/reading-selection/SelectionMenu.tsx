import styles from './SelectionMenu.module.css';

interface SelectionMenuProps {
  selectedText: string;
  position?: { left: number; top: number };
  onAsk?: () => void;
}

export function SelectionMenu({
  selectedText,
  position,
  onAsk = () => undefined,
}: SelectionMenuProps) {
  if (!selectedText.trim()) {
    return null;
  }

  return (
    <div
      className={styles.menu}
      data-selection-menu
      role="toolbar"
      aria-label="选区操作"
      style={position}
      onMouseDown={(event) => event.preventDefault()}
    >
      <button onClick={onAsk}>提问</button>
    </div>
  );
}

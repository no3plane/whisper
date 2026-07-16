import styles from './SelectionMenu.module.css';

interface SelectionMenuProps {
  selectedText: string;
  position?: { left: number; top: number };
  onStartInterpretation?: () => void;
}

export function SelectionMenu({
  selectedText,
  position,
  onStartInterpretation = () => undefined,
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
      <button onClick={onStartInterpretation}>新建解读</button>
    </div>
  );
}

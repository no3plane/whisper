interface SelectionMenuProps {
  selectedText: string;
  onExplain: () => void;
}

export function SelectionMenu({ selectedText, onExplain }: SelectionMenuProps) {
  if (!selectedText.trim()) return null;

  return (
    <div className="selection-menu">
      <span>
        {selectedText.slice(0, 24)}
        {selectedText.length > 24 ? '...' : ''}
      </span>
      <button onClick={onExplain}>白话解释</button>
    </div>
  );
}

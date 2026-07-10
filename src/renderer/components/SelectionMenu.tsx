import type { ReadingActionType } from '../../shared/types';

const actions: Array<[ReadingActionType, string]> = [
  ['plain_explanation', '解释'],
  ['structure_location', '定位'],
  ['concept_explanation', '概念'],
  ['background_context', '背景'],
  ['example_analogy', '例子'],
];

export function SelectionMenu({ selectedText, onAction }: { selectedText: string; onAction: (action: ReadingActionType) => void }) {
  if (!selectedText.trim()) return null;
  return <div className="selection-menu">
    <span>{selectedText.slice(0, 24)}{selectedText.length > 24 ? '...' : ''}</span>
    {actions.map(([value, label]) => <button key={value} onClick={() => onAction(value)}>{label}</button>)}
  </div>;
}

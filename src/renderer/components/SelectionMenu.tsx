import type { ReadingActionType } from '../../shared/types';

interface SelectionMenuProps {
  selectedText: string;
  mode?: 'draft' | 'thread';
  onSetTarget?: () => void;
  onStartConversation?: () => void;
  onReference?: () => void;
  /** @deprecated 仅为旧 ReaderPage 迁移期间保留。 */
  onAction?: (action: ReadingActionType) => void;
}

const legacyActions: Array<[ReadingActionType, string]> = [
  ['plain_explanation', '解释'],
  ['structure_location', '定位'],
  ['concept_explanation', '概念'],
  ['background_context', '背景'],
  ['example_analogy', '例子'],
];

export function SelectionMenu({
  selectedText,
  mode,
  onSetTarget = () => undefined,
  onStartConversation = () => undefined,
  onReference = () => undefined,
  onAction,
}: SelectionMenuProps) {
  if (!selectedText.trim()) return null;
  const isLegacy = mode === undefined && onAction !== undefined;

  return (
    <div className="selection-menu">
      <span>{selectedText.slice(0, 24)}{selectedText.length > 24 ? '...' : ''}</span>
      {isLegacy ? legacyActions.map(([action, label]) => (
        <button key={action} onClick={() => onAction(action)}>{label}</button>
      )) : mode === 'draft' ? (
        <button onClick={onSetTarget}>设为解读目标</button>
      ) : (
        <>
          <button onClick={onStartConversation}>围绕此处提问</button>
          <button onClick={onReference}>引用到当前会话</button>
        </>
      )}
    </div>
  );
}

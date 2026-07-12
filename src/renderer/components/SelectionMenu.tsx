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

export function SelectionMenu({
  selectedText,
  mode = 'draft',
  onSetTarget = () => undefined,
  onStartConversation = () => undefined,
  onReference = () => undefined,
}: SelectionMenuProps) {
  if (!selectedText.trim()) return null;

  return (
    <div className="selection-menu">
      <span>{selectedText.slice(0, 24)}{selectedText.length > 24 ? '...' : ''}</span>
      {mode === 'draft' ? (
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

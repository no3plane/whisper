import { isSkillAllowed } from '../../../shared/skills';
import type {
  ContextStrategy,
  MessageReference,
  ReadingSkillType,
  ReadingTarget,
} from '../../../shared/types';

export interface ConversationDraft {
  bookId: string;
  target: ReadingTarget;
  contextStrategy: ContextStrategy;
  mode: 'auto' | 'manual';
  strategySource: 'book-default' | 'draft-override';
  skillType: ReadingSkillType | null;
  prompt: string;
  reference: MessageReference | null;
}

export type DraftValidation =
  | { valid: true }
  | { valid: false; reason: 'prompt-required' | 'skill-not-allowed' };

function bookTarget(): ReadingTarget {
  return {
    type: 'book',
    chapterId: null,
    start: null,
    end: null,
    selectedText: '',
    breadcrumb: [],
  };
}

export function createBookDraft(
  bookId: string,
  contextStrategy: ContextStrategy,
): ConversationDraft {
  return {
    bookId,
    target: bookTarget(),
    contextStrategy,
    mode: 'auto',
    strategySource: 'book-default',
    skillType: null,
    prompt: '',
    reference: null,
  };
}

export function applyAutomaticSelection(
  draft: ConversationDraft,
  selection: ReadingTarget,
): ConversationDraft {
  if (draft.mode === 'manual') {
    return draft;
  }
  const skillType =
    draft.skillType && isSkillAllowed(selection.type, draft.skillType) ? draft.skillType : null;
  return { ...draft, target: selection, skillType };
}

export function clearAutomaticSelection(draft: ConversationDraft): ConversationDraft {
  if (draft.mode === 'manual' || draft.target.type !== 'selection') {
    return draft;
  }
  const target = bookTarget();
  const skillType =
    draft.skillType && isSkillAllowed(target.type, draft.skillType) ? draft.skillType : null;
  return { ...draft, target, skillType };
}

export function selectTarget(draft: ConversationDraft, target: ReadingTarget): ConversationDraft {
  const skillType =
    draft.skillType && isSkillAllowed(target.type, draft.skillType) ? draft.skillType : null;
  return { ...draft, target, skillType, mode: 'manual' };
}

export function replaceDraftFromSelection(
  draft: ConversationDraft,
  selection: ReadingTarget,
  bookDefaultStrategy: ContextStrategy,
): ConversationDraft {
  return {
    ...createBookDraft(draft.bookId, bookDefaultStrategy),
    target: selection,
    prompt: draft.prompt,
  };
}

export function validateDraft(draft: ConversationDraft): DraftValidation {
  if (draft.skillType && !isSkillAllowed(draft.target.type, draft.skillType)) {
    return { valid: false, reason: 'skill-not-allowed' };
  }
  return draft.skillType || draft.prompt.trim()
    ? { valid: true }
    : { valid: false, reason: 'prompt-required' };
}

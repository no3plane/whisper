import type { ReadingSkillType, ReadingTargetType } from './types';

export interface ReadingSkillDefinition {
  readonly id: ReadingSkillType;
  readonly label: string;
}

const SKILLS_BY_TARGET = {
  book: [
    { id: 'book_summary', label: '总结全书' },
    { id: 'book_framework', label: '提炼框架' },
    { id: 'book_critique', label: '评价全书' },
  ],
  chapter: [
    { id: 'chapter_summary', label: '概括本章' },
    { id: 'chapter_role', label: '章节作用' },
    { id: 'chapter_argument', label: '梳理论证' },
  ],
  selection: [
    { id: 'plain_explanation', label: '白话解释' },
    { id: 'concept_explanation', label: '解释概念' },
    { id: 'background_context', label: '补充背景' },
    { id: 'example_analogy', label: '举例类比' },
  ],
} as const satisfies Record<ReadingTargetType, readonly ReadingSkillDefinition[]>;

export function skillsForTarget(type: ReadingTargetType): readonly ReadingSkillDefinition[] {
  return SKILLS_BY_TARGET[type];
}

export function isSkillAllowed(type: ReadingTargetType, skill: ReadingSkillType): boolean {
  return skillsForTarget(type).some((item) => item.id === skill);
}

export function labelForSkill(skill: ReadingSkillType): string {
  for (const definitions of Object.values(SKILLS_BY_TARGET)) {
    const definition = definitions.find((item) => item.id === skill);
    if (definition) {
      return definition.label;
    }
  }
  return skill;
}

interface BuildThreadTitleInput {
  targetLabel: string;
  skillLabel: string | null;
  question: string;
}

const MAX_TITLE_LENGTH = 18;

export function buildThreadTitle(input: BuildThreadTitleInput): string {
  const suffix = input.skillLabel ?? input.question;
  const normalized = `${input.targetLabel} · ${suffix}`.replace(/\s+/gu, ' ').trim();
  const codePoints = Array.from(normalized);
  return codePoints.length <= MAX_TITLE_LENGTH
    ? normalized
    : `${codePoints.slice(0, MAX_TITLE_LENGTH).join('')}…`;
}

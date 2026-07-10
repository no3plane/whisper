import type { Chapter, ContextStrategy, Passage } from '../../shared/types';

interface ThreadMessageLike { role: 'user' | 'assistant' | 'system'; content: string }

interface ReadingActionContextInput {
  strategy: ContextStrategy;
  bookTitle: string;
  fullText: string;
  selectedText: string;
  nearbyText: string;
  actionInstruction: string;
  threadMessages: ThreadMessageLike[];
  chapters?: Chapter[];
  passages?: Passage[];
  currentChapterId?: string | null;
  contextWindow?: number;
}

export interface AssembledMessage { role: 'user' | 'assistant'; content: string }
export interface AssembledContext {
  system: string;
  messages: AssembledMessage[];
  requestedStrategy?: ContextStrategy;
  effectiveStrategy?: ContextStrategy;
  estimatedTokens?: number;
  degradationReason?: string | null;
}

const estimateTokens = (value: string) => Math.ceil(value.length / 3);

function compressedRepresentation(input: ReadingActionContextInput) {
  const passages = input.passages ?? [];
  const chapters = input.chapters ?? [];
  if (chapters.length === 0) return input.fullText.slice(0, 24000);
  return chapters.map((chapter) => {
    const chapterPassages = passages.filter((passage) => passage.chapterId === chapter.id);
    const samples = chapterPassages.length <= 4
      ? chapterPassages
      : [chapterPassages[0], chapterPassages[Math.floor(chapterPassages.length / 2)], chapterPassages[chapterPassages.length - 1]];
    return `## ${chapter.title}\n${samples.map((passage) => `[${passage.id}] ${passage.text}`).join('\n')}`;
  }).join('\n\n').slice(0, 36000);
}

function relatedPassages(input: ReadingActionContextInput) {
  const normalized = input.selectedText.toLowerCase().replace(/\s+/g, '');
  const terms = new Set<string>();
  for (const word of input.selectedText.toLowerCase().match(/[a-z0-9_]{3,}|[\u3400-\u9fff]{2,}/g) ?? []) terms.add(word);
  for (let i = 0; i < normalized.length - 1; i += 2) terms.add(normalized.slice(i, i + 2));
  return (input.passages ?? [])
    .filter((passage) => passage.chapterId !== input.currentChapterId)
    .map((passage) => ({ passage, score: [...terms].reduce((score, term) => score + (passage.text.toLowerCase().includes(term) ? 1 : 0), 0) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.passage.order - b.passage.order)
    .slice(0, 8)
    .map(({ passage }) => `[${passage.id}] ${passage.text}`)
    .join('\n\n');
}

export class ContextAssembler {
  forReadingAction(input: ReadingActionContextInput): AssembledContext {
    const requestedStrategy = input.strategy;
    const limit = Math.max(1, input.contextWindow ?? Number.MAX_SAFE_INTEGER);
    let effectiveStrategy = requestedStrategy;
    let degradationReason: string | null = null;
    let bookContext = '';

    if (effectiveStrategy === 'full_book' && estimateTokens(input.fullText) > Math.floor(limit * 0.72)) {
      effectiveStrategy = 'hybrid';
      degradationReason = `完整书籍估算 ${estimateTokens(input.fullText)} tokens，超过上下文预算，已降级为 hybrid。`;
    }

    if (effectiveStrategy === 'full_book') {
      bookContext = `完整书籍内容：\n${input.fullText}`;
    } else if (effectiveStrategy === 'compressed_book') {
      bookContext = `全书压缩表示：\n${compressedRepresentation(input)}`;
    } else {
      const compressed = compressedRepresentation(input);
      const current = (input.passages ?? [])
        .filter((passage) => passage.chapterId === input.currentChapterId)
        .map((passage) => `[${passage.id}] ${passage.text}`)
        .join('\n\n');
      const related = relatedPassages(input);
      bookContext = [`全书压缩表示：\n${compressed}`, `当前章节：\n${current}`, `相关原文：\n${related}`].join('\n\n');
    }

    const contextMessage: AssembledMessage = {
      role: 'user',
      content: [`书名：${input.bookTitle}`, bookContext, `当前选中文本：\n${input.selectedText}`, `附近上下文：\n${input.nearbyText}`].join('\n\n'),
    };
    const history = input.threadMessages
      .filter((message): message is { role: 'user' | 'assistant'; content: string } => message.role !== 'system')
      .filter((message) => message.content.trim().length > 0)
      .map(({ role, content }) => ({ role, content }));
    const system = ['你是一个 AI 阅读伴侣。', '原书始终是主要阅读对象；回答必须结合提供的全书背景，并在不确定时明确说明。', '优先使用中文回答。', `动作要求：\n${input.actionInstruction}`].join('\n');
    const messages = [contextMessage, ...history];
    const estimated = estimateTokens(system + messages.map((message) => message.content).join(''));
    if (estimated > limit) throw new Error(`上下文估算 ${estimated} tokens，超过模型窗口 ${limit}。请降低局部上下文或使用更大的模型窗口。`);
    return { system, messages, requestedStrategy, effectiveStrategy, estimatedTokens: estimated, degradationReason };
  }
}

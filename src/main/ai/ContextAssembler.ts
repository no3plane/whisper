import type {
  Chapter,
  ContextStrategy,
  MessageReference,
  Passage,
  ReadingTarget,
} from '../../shared/types';

interface ThreadMessageLike {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface ReadingActionContextInput {
  strategy: ContextStrategy;
  bookTitle: string;
  fullText: string;
  target: ReadingTarget;
  reference: MessageReference | null;
  skillInstruction: string | null;
  isInitialTurn: boolean;
  threadMessages: ThreadMessageLike[];
  chapters: Chapter[];
  passages: Passage[];
  contextWindow?: number;
}

interface BookKnowledge {
  text: string;
  coveredPassageIds: string[];
}

export interface AssembledMessage {
  role: 'user' | 'assistant';
  content: string;
}
export interface AssembledContext {
  system: string;
  messages: AssembledMessage[];
  coveredPassageIds: string[];
  requestedStrategy?: ContextStrategy;
  effectiveStrategy?: ContextStrategy;
  estimatedTokens?: number;
  degradationReason?: string | null;
}

const estimateTokens = (value: string) => Math.ceil(value.length / 3);

function passagesInChapter(input: ReadingActionContextInput, chapterId: string | null) {
  return input.passages.filter((passage) => passage.chapterId === chapterId);
}

function compressedKnowledge(
  input: ReadingActionContextInput,
  excludedChapterId: string | null = null,
): BookKnowledge {
  if (input.chapters.length === 0) {
    return { text: input.fullText.slice(0, 24000), coveredPassageIds: [] };
  }

  const includedChapters = input.chapters.filter((chapter) => chapter.id !== excludedChapterId);
  const blocks: string[] = [];
  const coveredPassageIds: string[] = [];
  let truncated = false;
  for (const chapter of includedChapters) {
    const chapterPassages = passagesInChapter(input, chapter.id);
    const samples =
      chapterPassages.length <= 4
        ? chapterPassages
        : [
            chapterPassages[0],
            chapterPassages[Math.floor(chapterPassages.length / 2)],
            chapterPassages[chapterPassages.length - 1],
          ];
    const heading = `## ${chapter.title}`;
    const chapterBlocks: string[] = [];
    for (const passage of samples) {
      const block = `[${passage.id}] ${passage.text}`;
      const candidateChapter = `${heading}\n${[...chapterBlocks, block].join('\n')}`;
      const candidateText = [...blocks, candidateChapter].join('\n\n');
      if (candidateText.length > 36000) {
        truncated = true;
        break;
      }
      chapterBlocks.push(block);
      coveredPassageIds.push(passage.id);
    }
    if (chapterBlocks.length > 0) {
      const chapterBlock = `${heading}\n${chapterBlocks.join('\n')}`;
      blocks.push(chapterBlock);
    }
    if (truncated) {
      break;
    }
  }
  return { text: blocks.join('\n\n'), coveredPassageIds };
}

function buildBookKnowledge(
  input: ReadingActionContextInput,
  strategy: ContextStrategy,
): BookKnowledge {
  if (strategy === 'full_book') {
    return {
      text: `完整书籍内容：\n${input.fullText}`,
      coveredPassageIds: input.passages.map((passage) => passage.id),
    };
  }

  const compressed = compressedKnowledge(
    input,
    strategy === 'hybrid' ? input.target.chapterId : null,
  );
  if (strategy === 'compressed_book') {
    return { ...compressed, text: `全书压缩表示：\n${compressed.text}` };
  }

  const targetChapter = passagesInChapter(input, input.target.chapterId);
  const covered = new Set(compressed.coveredPassageIds);
  targetChapter.forEach((passage) => covered.add(passage.id));
  const current = targetChapter.map((passage) => `[${passage.id}] ${passage.text}`).join('\n\n');
  return {
    text: [`全书压缩表示：\n${compressed.text}`, current ? `目标章节原文：\n${current}` : '']
      .filter(Boolean)
      .join('\n\n'),
    coveredPassageIds: [...covered],
  };
}

function passageRange(input: ReadingActionContextInput) {
  const start = input.passages.findIndex((passage) => passage.id === input.target.startPassageId);
  const end = input.passages.findIndex((passage) => passage.id === input.target.endPassageId);
  if (start < 0 || end < 0) {
    return [];
  }
  return input.passages.slice(Math.min(start, end), Math.max(start, end) + 1);
}

function buildTargetSupplement(
  input: ReadingActionContextInput,
  coveredIds: Set<string>,
  strategy: ContextStrategy,
) {
  if (input.target.type === 'book') {
    return '';
  }

  const range = passageRange(input);
  const missing = range.filter((passage) => !coveredIds.has(passage.id));
  if (input.target.type === 'chapter') {
    if (missing.length === 0) {
      return '';
    }
    return `解读目标补充：\n${missing.map((passage) => `[${passage.id}] ${passage.text}`).join('\n\n')}`;
  }

  // 压缩全书只提供稀疏采样；选区任务仍需显式给出精确选区及相邻原文。
  if (strategy !== 'compressed_book' && missing.length === 0) {
    return '';
  }
  if (range.length === 0) {
    return `解读目标补充：\n精确选区：${input.target.selectedText}`;
  }
  const indices = range.map((passage) => input.passages.indexOf(passage));
  const validIndices = indices.filter((index) => index >= 0);
  if (validIndices.length === 0) {
    return `解读目标补充：\n精确选区：${input.target.selectedText}`;
  }
  const start = Math.max(0, Math.min(...validIndices) - 1);
  const end = Math.min(input.passages.length - 1, Math.max(...validIndices) + 1);
  const nearby = input.passages
    .slice(start, end + 1)
    .filter((passage) => !coveredIds.has(passage.id));
  return [
    '解读目标补充：',
    `精确选区：${input.target.selectedText}`,
    nearby.length > 0
      ? nearby.map((passage) => `[${passage.id}] ${passage.text}`).join('\n\n')
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function targetDescription(target: ReadingTarget) {
  const path = target.breadcrumb.map((crumb) => crumb.title).join(' > ');
  if (target.type === 'book') {
    return '整本书';
  }
  if (target.type === 'chapter') {
    return `章节：${path || target.chapterId || '未知章节'}`;
  }
  return [`框选内容：${target.selectedText}`, path ? `路径：${path}` : '']
    .filter(Boolean)
    .join('\n');
}

export class ContextAssembler {
  forReadingAction(input: ReadingActionContextInput): AssembledContext {
    const requestedStrategy = input.strategy;
    const limit = Math.max(1, input.contextWindow ?? Number.MAX_SAFE_INTEGER);
    let effectiveStrategy = requestedStrategy;
    let degradationReason: string | null = null;

    if (
      effectiveStrategy === 'full_book' &&
      estimateTokens(input.fullText) > Math.floor(limit * 0.72)
    ) {
      effectiveStrategy = 'hybrid';
      degradationReason = `完整书籍估算 ${estimateTokens(input.fullText)} tokens，超过上下文预算，已降级为 hybrid。`;
    }

    const knowledge = buildBookKnowledge(input, effectiveStrategy);
    const supplement = buildTargetSupplement(
      input,
      new Set(knowledge.coveredPassageIds),
      effectiveStrategy,
    );
    const reference = input.reference
      ? `本轮引用：\n路径：${input.reference.breadcrumb.map((crumb) => crumb.title).join(' > ')}\n${input.reference.selectedText}`
      : '';
    const contextMessage: AssembledMessage = {
      role: 'user',
      content: [
        `书名：${input.bookTitle}`,
        knowledge.text,
        `固定解读目标：\n${targetDescription(input.target)}`,
        supplement,
        reference,
      ]
        .filter(Boolean)
        .join('\n\n'),
    };
    const history = input.threadMessages
      .filter(
        (message): message is { role: 'user' | 'assistant'; content: string } =>
          message.role !== 'system',
      )
      .filter((message) => message.content.trim().length > 0)
      .map(({ role, content }) => ({ role, content }));
    const systemParts = [
      '你是一个 AI 阅读伴侣。',
      '原书始终是主要阅读对象；回答必须结合提供的全书背景，并在不确定时明确说明。',
      '优先使用中文回答。',
    ];
    if (input.isInitialTurn && input.skillInstruction) {
      systemParts.push(`技能要求：\n${input.skillInstruction}`);
    }
    const system = systemParts.join('\n');
    const messages = [contextMessage, ...history];
    const estimated = estimateTokens(system + messages.map((message) => message.content).join(''));
    if (estimated > limit) {
      throw new Error(
        `上下文估算 ${estimated} tokens，超过模型窗口 ${limit}。请降低局部上下文或使用更大的模型窗口。`,
      );
    }
    return {
      system,
      messages,
      coveredPassageIds: knowledge.coveredPassageIds,
      requestedStrategy,
      effectiveStrategy,
      estimatedTokens: estimated,
      degradationReason,
    };
  }
}

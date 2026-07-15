import type {
  Chapter,
  ContextStrategy,
  MessageReference,
  MarkdownBlock,
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
  blocks: MarkdownBlock[];
  contextWindow?: number;
}

interface BookKnowledge {
  text: string;
  coveredBlockIds: string[];
}

export interface AssembledMessage {
  role: 'user' | 'assistant';
  content: string;
}
export interface AssembledContext {
  system: string;
  messages: AssembledMessage[];
  coveredBlockIds: string[];
  requestedStrategy?: ContextStrategy;
  effectiveStrategy?: ContextStrategy;
  estimatedTokens?: number;
  degradationReason?: string | null;
}

const estimateTokens = (value: string) => Math.ceil(value.length / 3);

function blocksInChapter(input: ReadingActionContextInput, chapterId: string | null) {
  const chapter = input.chapters.find((item) => item.id === chapterId);
  return chapter
    ? input.blocks.filter(
        (block) =>
          block.sourceStart >= chapter.sourceStart && block.sourceStart < chapter.sourceEnd,
      )
    : [];
}

function compressedKnowledge(
  input: ReadingActionContextInput,
  excludedChapterId: string | null = null,
): BookKnowledge {
  if (input.chapters.length === 0) {
    return { text: input.fullText.slice(0, 24000), coveredBlockIds: [] };
  }

  const includedChapters = input.chapters.filter((chapter) => chapter.id !== excludedChapterId);
  const blocks: string[] = [];
  const coveredBlockIds: string[] = [];
  let truncated = false;
  for (const chapter of includedChapters) {
    const chapterBlocks = blocksInChapter(input, chapter.id);
    const samples =
      chapterBlocks.length <= 4
        ? chapterBlocks
        : [
            chapterBlocks[0],
            chapterBlocks[Math.floor(chapterBlocks.length / 2)],
            chapterBlocks[chapterBlocks.length - 1],
          ];
    const heading = `## ${chapter.title}`;
    const renderedBlocks: string[] = [];
    for (const sample of samples) {
      const block = `[${sample.id}] ${sample.markdown}`;
      const candidateChapter = `${heading}\n${[...renderedBlocks, block].join('\n')}`;
      const candidateText = [...blocks, candidateChapter].join('\n\n');
      if (candidateText.length > 36000) {
        truncated = true;
        break;
      }
      renderedBlocks.push(block);
      coveredBlockIds.push(sample.id);
    }
    if (renderedBlocks.length > 0) {
      const chapterBlock = `${heading}\n${renderedBlocks.join('\n')}`;
      blocks.push(chapterBlock);
    }
    if (truncated) {
      break;
    }
  }
  return { text: blocks.join('\n\n'), coveredBlockIds };
}

function buildBookKnowledge(
  input: ReadingActionContextInput,
  strategy: ContextStrategy,
): BookKnowledge {
  if (strategy === 'full_book') {
    return {
      text: `完整书籍内容：\n${input.fullText}`,
      coveredBlockIds: input.blocks.map((block) => block.id),
    };
  }

  const compressed = compressedKnowledge(
    input,
    strategy === 'hybrid' ? input.target.chapterId : null,
  );
  if (strategy === 'compressed_book') {
    return { ...compressed, text: `全书压缩表示：\n${compressed.text}` };
  }

  const targetChapter = blocksInChapter(input, input.target.chapterId);
  const covered = new Set(compressed.coveredBlockIds);
  targetChapter.forEach((block) => covered.add(block.id));
  const current = targetChapter.map((block) => `[${block.id}] ${block.markdown}`).join('\n\n');
  return {
    text: [`全书压缩表示：\n${compressed.text}`, current ? `目标章节原文：\n${current}` : '']
      .filter(Boolean)
      .join('\n\n'),
    coveredBlockIds: [...covered],
  };
}

function blockRange(input: ReadingActionContextInput) {
  const start = input.blocks.findIndex((block) => block.id === input.target.start?.blockId);
  const end = input.blocks.findIndex((block) => block.id === input.target.end?.blockId);
  if (start < 0 || end < 0) {
    return [];
  }
  return input.blocks.slice(Math.min(start, end), Math.max(start, end) + 1);
}

function buildTargetSupplement(
  input: ReadingActionContextInput,
  coveredIds: Set<string>,
  strategy: ContextStrategy,
) {
  if (input.target.type === 'book') {
    return '';
  }

  const range = blockRange(input);
  const missing = range.filter((block) => !coveredIds.has(block.id));
  if (input.target.type === 'chapter') {
    if (missing.length === 0) {
      return '';
    }
    return `解读目标补充：\n${missing.map((block) => `[${block.id}] ${block.markdown}`).join('\n\n')}`;
  }

  // 压缩全书只提供稀疏采样；选区任务仍需显式给出精确选区及相邻原文。
  if (strategy !== 'compressed_book' && missing.length === 0) {
    return '';
  }
  if (range.length === 0) {
    return `解读目标补充：\n精确选区：${input.target.selectedText}`;
  }
  const indices = range.map((block) => input.blocks.indexOf(block));
  const validIndices = indices.filter((index) => index >= 0);
  if (validIndices.length === 0) {
    return `解读目标补充：\n精确选区：${input.target.selectedText}`;
  }
  const start = Math.max(0, Math.min(...validIndices) - 1);
  const end = Math.min(input.blocks.length - 1, Math.max(...validIndices) + 1);
  const nearby = input.blocks.slice(start, end + 1).filter((block) => !coveredIds.has(block.id));
  return [
    '解读目标补充：',
    `精确选区：${input.target.selectedText}`,
    nearby.length > 0 ? nearby.map((block) => `[${block.id}] ${block.markdown}`).join('\n\n') : '',
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
      new Set(knowledge.coveredBlockIds),
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
      coveredBlockIds: knowledge.coveredBlockIds,
      requestedStrategy,
      effectiveStrategy,
      estimatedTokens: estimated,
      degradationReason,
    };
  }
}

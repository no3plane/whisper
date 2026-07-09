import type { ContextStrategy } from '../../shared/types';

interface ThreadMessageLike {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface ReadingActionContextInput {
  strategy: ContextStrategy;
  bookTitle: string;
  fullText: string;
  selectedText: string;
  nearbyText: string;
  actionInstruction: string;
  threadMessages: ThreadMessageLike[];
}

export interface AssembledMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AssembledContext {
  system: string;
  messages: AssembledMessage[];
}

export class ContextAssembler {
  forReadingAction(input: ReadingActionContextInput): AssembledContext {
    if (input.strategy !== 'full_book') {
      throw new Error(`当前纵向切片只支持 full_book 策略，收到：${input.strategy}`);
    }

    const contextMessage: AssembledMessage = {
      role: 'user',
      content: [
        `书名：${input.bookTitle}`,
        '完整书籍内容：',
        input.fullText,
        '当前选中文本：',
        input.selectedText,
        '附近上下文：',
        input.nearbyText,
      ].join('\n\n'),
    };

    const history = input.threadMessages
      .filter(
        (message): message is { role: 'user' | 'assistant'; content: string } =>
          message.role === 'user' || message.role === 'assistant',
      )
      .filter((message) => message.content.trim().length > 0)
      .map((message) => ({
        role: message.role,
        content: message.content,
      }));

    return {
      system: [
        '你是一个 AI 阅读伴侣。',
        '你的任务不是替代原书，而是在读者主动召唤时帮助理解。',
        '回答时尽量让全书在场：结合完整书籍、选中文本、附近上下文和当前追问历史。',
        '优先使用中文回答。',
        '动作要求：',
        input.actionInstruction,
      ].join('\n'),
      messages: [contextMessage, ...history],
    };
  }
}

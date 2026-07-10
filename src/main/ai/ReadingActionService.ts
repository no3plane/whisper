import type { BrowserWindow } from 'electron';
import type {
  AiStreamEvent,
  FollowUpInput,
  RunReadingActionInput,
} from '../../shared/types';
import { ipcChannels } from '../../shared/ipc';
import { logger } from '../logging/logger';
import type { LibraryService } from '../library/LibraryService';
import type { SettingsService } from '../settings/SettingsService';
import type { ThreadStore } from '../threads/ThreadStore';
import { AIProvider } from './AIProvider';
import { ContextAssembler } from './ContextAssembler';

const actionDefinitions = {
  plain_explanation: { title: '白话解释', instruction: '先用 1-2 句话说清楚这段在讲什么，再解释最容易卡住的点。' },
  structure_location: { title: '结构定位', instruction: '解释这段如何服务于全书核心问题、作者主张与论证主干，并引用提供的 passage 锚点。' },
  concept_explanation: { title: '概念解释', instruction: '识别并解释选文中的关键概念，说明概念之间的关系及作者在本书中的具体用法。' },
  background_context: { title: '背景补全', instruction: '只补充理解选文必需的历史、人物、学派、术语或时代背景，并区分原书内容和外部背景。' },
  example_analogy: { title: '举例 / 类比', instruction: '给出准确的现代例子或类比，说明类比对应关系以及类比失效的边界。' },
} as const;

export class ReadingActionService {
  private readonly assembler = new ContextAssembler();
  private readonly provider = new AIProvider();

  constructor(
    private readonly settings: SettingsService,
    private readonly library: LibraryService,
    private readonly threads: ThreadStore,
  ) {}

  async runReadingAction(input: RunReadingActionInput, window: BrowserWindow) {
    const aiSettings = this.requireSettings();
    const action = actionDefinitions[input.actionType];
    const document = this.library.openBook(input.bookId);
    const passage = document.passages.find((item) => item.id === input.passageId) ?? null;
    const nearbyText = this.getNearbyText(document.passages, input.passageId, input.selectedText);

    const thread = this.threads.createThread({
      bookId: input.bookId,
      chapterId: passage?.chapterId ?? null,
      passageId: input.passageId,
      title: action.title,
      actionType: input.actionType,
      selectedText: input.selectedText,
      contextStrategy: input.contextStrategy,
      status: 'streaming',
    });

    this.threads.addMessage({
      threadId: thread.id,
      role: 'user',
      content: input.selectedText,
      model: null,
      tokenUsage: null,
      contextStrategy: input.contextStrategy,
    });

    logger.info('threads.create', {
      bookId: input.bookId,
      threadId: thread.id,
      actionType: input.actionType,
      contextStrategy: input.contextStrategy,
      selectedText: input.selectedText,
    });

    const assistantMessage = this.threads.addMessage({
      threadId: thread.id,
      role: 'assistant',
      content: '',
      model: aiSettings.model,
      tokenUsage: null,
      contextStrategy: input.contextStrategy,
    });

    this.emit(window, {
      type: 'started',
      thread: this.threads.getThread(thread.id),
      messages: this.threads.listMessages(thread.id),
      assistantMessageId: assistantMessage.id,
    });

    const context = this.assembler.forReadingAction({
      strategy: input.contextStrategy,
      bookTitle: document.book.title,
      fullText: document.fullText,
      selectedText: input.selectedText,
      nearbyText,
      actionInstruction: action.instruction,
      threadMessages: [],
      chapters: document.chapters,
      passages: document.passages,
      currentChapterId: passage?.chapterId,
      contextWindow: aiSettings.contextWindow,
    });

    try {
      const output = await this.provider.streamGenerate(aiSettings, context, {
        onChunk: (chunk) => {
          this.emit(window, {
            type: 'chunk',
            threadId: thread.id,
            messageId: assistantMessage.id,
            chunk,
          });
        },
      });

      this.threads.updateMessage(assistantMessage.id, {
        content: output.text,
        model: aiSettings.model,
        tokenUsage: output.usage,
      });
      this.threads.updateThreadStatus(thread.id, 'ready');

      const result = {
        thread: this.threads.getThread(thread.id),
        messages: this.threads.listMessages(thread.id),
      };
      this.emit(window, { type: 'done', ...result });
      return result;
    } catch (error) {
      this.threads.updateThreadStatus(thread.id, 'failed');
      const message = error instanceof Error ? error.message : String(error);
      this.emit(window, { type: 'error', threadId: thread.id, message });
      throw error;
    }
  }

  async followUp(input: FollowUpInput, window: BrowserWindow) {
    const aiSettings = this.requireSettings();
    const thread = this.threads.getThread(input.threadId);
    const document = this.library.openBook(thread.bookId);
    const nearbyText = this.getNearbyText(document.passages, thread.passageId, thread.selectedText);

    this.threads.updateThreadStatus(input.threadId, 'streaming');

    logger.info('threads.followUp', {
      bookId: thread.bookId,
      threadId: input.threadId,
      question: input.question,
    });

    this.threads.addMessage({
      threadId: input.threadId,
      role: 'user',
      content: input.question,
      model: null,
      tokenUsage: null,
      contextStrategy: thread.contextStrategy,
    });

    const assistantMessage = this.threads.addMessage({
      threadId: input.threadId,
      role: 'assistant',
      content: '',
      model: aiSettings.model,
      tokenUsage: null,
      contextStrategy: thread.contextStrategy,
    });

    this.emit(window, {
      type: 'started',
      thread: this.threads.getThread(input.threadId),
      messages: this.threads.listMessages(input.threadId),
      assistantMessageId: assistantMessage.id,
    });

    const messages = this.threads.listMessages(input.threadId).filter((item) => item.id !== assistantMessage.id);
    const context = this.assembler.forReadingAction({
      strategy: thread.contextStrategy,
      bookTitle: document.book.title,
      fullText: document.fullText,
      selectedText: thread.selectedText,
      nearbyText,
      actionInstruction: '请基于当前阅读上下文，回答读者在这个阅读 tab 中的追问。',
      threadMessages: messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      chapters: document.chapters,
      passages: document.passages,
      currentChapterId: thread.chapterId,
      contextWindow: aiSettings.contextWindow,
    });

    try {
      const output = await this.provider.streamGenerate(aiSettings, context, {
        onChunk: (chunk) => {
          this.emit(window, {
            type: 'chunk',
            threadId: input.threadId,
            messageId: assistantMessage.id,
            chunk,
          });
        },
      });

      this.threads.updateMessage(assistantMessage.id, {
        content: output.text,
        model: aiSettings.model,
        tokenUsage: output.usage,
      });
      this.threads.updateThreadStatus(input.threadId, 'ready');

      const result = {
        thread: this.threads.getThread(input.threadId),
        messages: this.threads.listMessages(input.threadId),
      };
      this.emit(window, { type: 'done', ...result });
      return result;
    } catch (error) {
      this.threads.updateThreadStatus(input.threadId, 'failed');
      const message = error instanceof Error ? error.message : String(error);
      this.emit(window, { type: 'error', threadId: input.threadId, message });
      throw error;
    }
  }

  private emit(window: BrowserWindow, event: AiStreamEvent) {
    if (!window.isDestroyed()) {
      window.webContents.send(ipcChannels.aiStream, event);
    }
  }

  private requireSettings() {
    const aiSettings = this.settings.getAISettings();
    if (!aiSettings) {
      throw new Error('请先在设置页填写模型配置。');
    }
    return aiSettings;
  }

  private getNearbyText(passages: Array<{ id: string; text: string }>, passageId: string | null, selectedText: string) {
    if (!passageId) return selectedText;
    const index = passages.findIndex((passage) => passage.id === passageId);
    if (index < 0) return selectedText;

    return passages
      .slice(Math.max(0, index - 2), index + 3)
      .map((passage) => passage.text)
      .join('\n\n');
  }
}

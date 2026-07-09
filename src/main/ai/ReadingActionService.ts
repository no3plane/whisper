import type { FollowUpInput, RunReadingActionInput, ThreadMessage } from '../../shared/types';
import type { LibraryService } from '../library/LibraryService';
import type { SettingsService } from '../settings/SettingsService';
import type { ThreadStore } from '../threads/ThreadStore';
import { AIProvider } from './AIProvider';
import { ContextAssembler } from './ContextAssembler';

const plainExplanationInstruction =
  '请用白话解释当前选中文本。要求：先用 1-2 句话说清楚这段在讲什么，再列出最容易卡住的点。不要替代原文，不要输出长篇总结。';

export class ReadingActionService {
  private readonly assembler = new ContextAssembler();
  private readonly provider = new AIProvider();

  constructor(
    private readonly settings: SettingsService,
    private readonly library: LibraryService,
    private readonly threads: ThreadStore,
  ) {}

  async runReadingAction(input: RunReadingActionInput) {
    if (input.actionType !== 'plain_explanation') {
      throw new Error(`当前纵向切片只支持 plain_explanation，收到：${input.actionType}`);
    }

    const aiSettings = this.requireSettings();
    const document = this.library.openBook(input.bookId);
    const passage = document.passages.find((item) => item.id === input.passageId) ?? null;
    const nearbyText = this.getNearbyText(document.passages, input.passageId, input.selectedText);

    const thread = this.threads.createThread({
      bookId: input.bookId,
      chapterId: passage?.chapterId ?? null,
      passageId: input.passageId,
      title: '白话解释',
      actionType: input.actionType,
      selectedText: input.selectedText,
      contextStrategy: input.contextStrategy,
    });

    this.threads.addMessage({
      threadId: thread.id,
      role: 'user',
      content: input.selectedText,
      model: null,
      tokenUsage: null,
      contextStrategy: input.contextStrategy,
    });

    const context = this.assembler.forReadingAction({
      strategy: input.contextStrategy,
      bookTitle: document.book.title,
      fullText: document.fullText,
      selectedText: input.selectedText,
      nearbyText,
      actionInstruction: plainExplanationInstruction,
      threadMessages: [],
    });

    const output = await this.provider.generate(aiSettings, context);
    this.threads.addMessage({
      threadId: thread.id,
      role: 'assistant',
      content: output.text,
      model: aiSettings.model,
      tokenUsage: output.usage,
      contextStrategy: input.contextStrategy,
    });

    return {
      thread: this.threads.getThread(thread.id),
      messages: this.threads.listMessages(thread.id),
    };
  }

  async followUp(input: FollowUpInput) {
    const aiSettings = this.requireSettings();
    const thread = this.threads.getThread(input.threadId);
    const document = this.library.openBook(thread.bookId);
    const nearbyText = this.getNearbyText(document.passages, thread.passageId, thread.selectedText);

    this.threads.addMessage({
      threadId: input.threadId,
      role: 'user',
      content: input.question,
      model: null,
      tokenUsage: null,
      contextStrategy: thread.contextStrategy,
    });

    const messages = this.threads.listMessages(input.threadId);
    const context = this.assembler.forReadingAction({
      strategy: thread.contextStrategy,
      bookTitle: document.book.title,
      fullText: document.fullText,
      selectedText: thread.selectedText,
      nearbyText,
      actionInstruction: `请回答读者对这个阅读 tab 的追问：${input.question}`,
      threadMessages: messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
    });

    const output = await this.provider.generate(aiSettings, context);
    this.threads.addMessage({
      threadId: input.threadId,
      role: 'assistant',
      content: output.text,
      model: aiSettings.model,
      tokenUsage: output.usage,
      contextStrategy: thread.contextStrategy,
    });

    return {
      thread: this.threads.getThread(input.threadId),
      messages: this.threads.listMessages(input.threadId),
    };
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

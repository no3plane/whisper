import type { BrowserWindow } from 'electron';
import type {
  AiStreamEvent,
  CreateConversationInput,
  DeleteThreadInput,
  FollowUpInput,
  ReadingSkillType,
  ReadingTargetType,
  ReadingThread,
  RetryMessageInput,
  ThreadMessage,
} from '../../shared/types';
import { ipcChannels } from '../../shared/ipc';
import type { LibraryService } from '../library/LibraryService';
import type { SettingsService } from '../settings/SettingsService';
import type { ThreadStore } from '../threads/ThreadStore';
import { AIProvider } from './AIProvider';
import { ContextAssembler } from './ContextAssembler';
import { buildThreadTitle } from '../../shared/skills';

const skills: Record<
  ReadingSkillType,
  { title: string; target: ReadingTargetType; instruction: string }
> = {
  book_summary: { title: '总结全书', target: 'book', instruction: '总结全书的核心内容。' },
  book_framework: { title: '全书框架', target: 'book', instruction: '梳理全书的结构与核心框架。' },
  book_critique: { title: '评价全书', target: 'book', instruction: '评价全书的主要论点及其边界。' },
  chapter_summary: { title: '概括本章', target: 'chapter', instruction: '概括本章的核心内容。' },
  chapter_role: { title: '章节作用', target: 'chapter', instruction: '说明本章在全书中的作用。' },
  chapter_argument: { title: '梳理论证', target: 'chapter', instruction: '梳理本章的论证结构。' },
  plain_explanation: {
    title: '白话解释',
    target: 'selection',
    instruction: '用清楚的白话解释选区。',
  },
  concept_explanation: {
    title: '概念解释',
    target: 'selection',
    instruction: '解释选区中的关键概念。',
  },
  background_context: {
    title: '背景补全',
    target: 'selection',
    instruction: '补充理解选区所需的背景。',
  },
  example_analogy: {
    title: '举例 / 类比',
    target: 'selection',
    instruction: '用准确的例子或类比解释选区。',
  },
};

type Provider = Pick<AIProvider, 'streamGenerate'>;

export class ReadingActionService {
  private readonly assembler = new ContextAssembler();
  private readonly inFlight = new Set<string>();

  constructor(
    private readonly settings: SettingsService,
    private readonly library: LibraryService,
    private readonly threads: ThreadStore,
    private readonly provider: Provider = new AIProvider(),
  ) {}

  async createConversation(input: CreateConversationInput, window: BrowserWindow) {
    this.validateCreate(input);
    const aiSettings = this.requireSettings();
    const document = this.library.openBook(input.bookId);
    const skill = input.skillType ? skills[input.skillType] : null;
    const prompt = input.prompt.trim();
    const targetTitle =
      input.target.type === 'book'
        ? '全书'
        : input.target.type === 'chapter'
          ? input.target.breadcrumb[0]?.title || '章节'
          : input.target.selectedText.slice(0, 12) || '解读目标';
    const thread = this.threads.createThread({
      bookId: input.bookId,
      title: buildThreadTitle({
        targetLabel: targetTitle,
        skillLabel: skill?.title ?? null,
        question: prompt,
      }),
      target: input.target,
      skillType: input.skillType,
      contextStrategy: input.contextStrategy,
      status: 'streaming',
    });
    this.threads.addMessage({
      threadId: thread.id,
      role: 'user',
      content: prompt || skill!.title,
      contextStrategy: input.contextStrategy,
    });
    const assistant = this.threads.addMessage({
      threadId: thread.id,
      role: 'assistant',
      content: '',
      model: aiSettings.model,
      contextStrategy: input.contextStrategy,
      status: 'streaming',
    });
    this.acquire(thread.id);
    return this.run(thread, assistant, window, () =>
      this.assembler.forReadingAction({
        strategy: input.contextStrategy,
        bookTitle: document.book.title,
        fullText: document.fullText,
        target: input.target,
        reference: null,
        skillInstruction: skill?.instruction ?? null,
        isInitialTurn: true,
        threadMessages: this.threads
          .listMessages(thread.id)
          .filter((message) => message.id !== assistant.id),
        chapters: document.chapters,
        passages: document.passages,
        contextWindow: aiSettings.contextWindow,
      }),
    );
  }

  async followUp(input: FollowUpInput, window: BrowserWindow) {
    this.validateFollowUp(input);
    const aiSettings = this.requireSettings();
    const thread = this.threads.getThread(input.threadId);
    this.acquire(thread.id);
    try {
      this.threads.updateThreadStatus(thread.id, 'streaming');
      this.threads.addMessage({
        threadId: thread.id,
        role: 'user',
        content: input.question.trim(),
        reference: input.reference ?? null,
        contextStrategy: thread.contextStrategy,
      });
      const assistant = this.threads.addMessage({
        threadId: thread.id,
        role: 'assistant',
        content: '',
        model: aiSettings.model,
        contextStrategy: thread.contextStrategy,
        status: 'streaming',
      });
      return await this.run(thread, assistant, window, () =>
        this.buildContext(thread, assistant, input.reference ?? null, false),
      );
    } finally {
      this.inFlight.delete(thread.id);
    }
  }

  async retry(input: RetryMessageInput, window: BrowserWindow) {
    this.validateRetry(input);
    const thread = this.threads.getThread(input.threadId);
    this.acquire(thread.id);
    try {
      const messages = this.threads.listMessages(thread.id);
      const index = messages.findIndex((message) => message.id === input.messageId);
      const message = messages[index];
      if (!message || message.threadId !== thread.id) {
        throw new Error('重试消息不属于当前会话。');
      }
      if (message.role !== 'assistant' || message.status !== 'failed') {
        throw new Error('只能重试失败的 assistant message。');
      }
      const assistant = this.threads.resetMessageForRetry(message.id);
      const history = messages.slice(0, index);
      return await this.run(
        thread,
        assistant,
        window,
        () =>
          this.buildContext(
            thread,
            assistant,
            messages[index - 1]?.reference ?? null,
            index === 1,
            history,
          ),
        [...messages.slice(0, index), assistant],
      );
    } finally {
      this.inFlight.delete(thread.id);
    }
  }

  deleteConversation(input: DeleteThreadInput) {
    if (
      !input ||
      typeof input !== 'object' ||
      typeof input.threadId !== 'string' ||
      !input.threadId.trim()
    ) {
      throw new Error('删除会话参数无效：threadId 必须是非空字符串。');
    }
    const thread = this.threads.getThread(input.threadId);
    if (thread.status === 'streaming' || this.inFlight.has(thread.id)) {
      throw new Error('生成中的会话不能删除。');
    }
    this.threads.deleteThread(input.threadId);
  }

  private buildContext(
    thread: ReadingThread,
    assistant: ThreadMessage,
    reference: ThreadMessage['reference'],
    isInitialTurn: boolean,
    history?: ThreadMessage[],
  ) {
    const aiSettings = this.requireSettings();
    const document = this.library.openBook(thread.bookId);
    return this.assembler.forReadingAction({
      strategy: thread.contextStrategy,
      bookTitle: document.book.title,
      fullText: document.fullText,
      target: thread.target,
      reference,
      skillInstruction: thread.skillType ? skills[thread.skillType].instruction : null,
      isInitialTurn,
      threadMessages:
        history ?? this.threads.listMessages(thread.id).filter((item) => item.id !== assistant.id),
      chapters: document.chapters,
      passages: document.passages,
      contextWindow: aiSettings.contextWindow,
    });
  }

  private async run(
    thread: ReadingThread,
    assistant: ThreadMessage,
    window: BrowserWindow,
    assemble: () => Parameters<Provider['streamGenerate']>[1],
    startedMessages?: ThreadMessage[],
  ) {
    const aiSettings = this.requireSettings();
    this.emit(window, {
      type: 'started',
      thread: this.threads.getThread(thread.id),
      messages: startedMessages ?? this.threads.listMessages(thread.id),
      assistantMessageId: assistant.id,
    });
    try {
      const context = assemble();
      this.threads.updateMessage(assistant.id, {
        effectiveContextStrategy: context.effectiveStrategy ?? thread.contextStrategy,
        degradationReason: context.degradationReason ?? null,
      });
      const output = await this.provider.streamGenerate(aiSettings, context, {
        onChunk: (chunk) =>
          this.emit(window, { type: 'chunk', threadId: thread.id, messageId: assistant.id, chunk }),
      });
      this.threads.updateMessage(assistant.id, {
        content: output.text,
        model: aiSettings.model,
        tokenUsage: output.usage,
        status: 'complete',
        error: null,
      });
      this.threads.updateThreadStatus(thread.id, 'ready');
      const result = {
        thread: this.threads.getThread(thread.id),
        messages: this.threads.listMessages(thread.id),
      };
      this.emit(window, { type: 'done', ...result });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.threads.markMessageFailed(assistant.id, message);
      this.emit(window, { type: 'error', threadId: thread.id, messageId: assistant.id, message });
      throw error;
    } finally {
      this.inFlight.delete(thread.id);
    }
  }

  private acquire(threadId: string) {
    if (this.inFlight.has(threadId)) {
      throw new Error('该会话正在生成回答，请稍后再试。');
    }
    this.inFlight.add(threadId);
  }

  private validateCreate(input: CreateConversationInput) {
    if (!input || typeof input !== 'object') {
      throw new Error('创建会话参数无效。');
    }
    if (typeof input.bookId !== 'string' || !input.bookId.trim()) {
      throw new Error('bookId 必须是非空字符串。');
    }
    if (typeof input.prompt !== 'string') {
      throw new Error('prompt 必须是字符串。');
    }
    if (!['full_book', 'compressed_book', 'hybrid'].includes(input.contextStrategy)) {
      throw new Error('全书认知策略无效。');
    }
    this.validateTarget(input.target);
    if (
      input.skillType !== null &&
      (typeof input.skillType !== 'string' || !Object.hasOwn(skills, input.skillType))
    ) {
      throw new Error('技能类型无效。');
    }
    if (!input.skillType && !input.prompt.trim()) {
      throw new Error('请输入问题。');
    }
    if (input.skillType && skills[input.skillType].target !== input.target.type) {
      throw new Error('所选技能不适用于当前解读目标。');
    }
  }

  private validateTarget(target: CreateConversationInput['target']) {
    if (!target || typeof target !== 'object') {
      throw new Error('解读目标无效。');
    }
    if (!['book', 'chapter', 'selection'].includes(target.type)) {
      throw new Error('解读目标类型无效。');
    }
    const nullableString = (value: unknown) => value === null || typeof value === 'string';
    const nullableNumber = (value: unknown) => value === null || typeof value === 'number';
    const validBreadcrumb =
      Array.isArray(target.breadcrumb) &&
      target.breadcrumb.every(
        (crumb) => crumb && typeof crumb.chapterId === 'string' && typeof crumb.title === 'string',
      );
    if (
      !nullableString(target.chapterId) ||
      !nullableString(target.startPassageId) ||
      !nullableString(target.endPassageId) ||
      typeof target.selectedText !== 'string' ||
      !nullableNumber(target.startOffset) ||
      !nullableNumber(target.endOffset) ||
      !validBreadcrumb
    ) {
      throw new Error('解读目标字段无效。');
    }
    if (target.type === 'chapter' && (!target.chapterId || !target.chapterId.trim())) {
      throw new Error('章节目标必须包含 chapterId。');
    }
    if (
      target.type === 'selection' &&
      (!target.startPassageId?.trim() ||
        !target.endPassageId?.trim() ||
        !target.selectedText.trim() ||
        target.startOffset === null ||
        target.endOffset === null)
    ) {
      throw new Error('框选目标必须包含 passage、文本和偏移量。');
    }
  }

  private validateFollowUp(input: FollowUpInput) {
    if (!input || typeof input !== 'object') {
      throw new Error('追问参数无效。');
    }
    if (typeof input.threadId !== 'string' || !input.threadId.trim()) {
      throw new Error('threadId 必须是非空字符串。');
    }
    if (typeof input.question !== 'string') {
      throw new Error('question 必须是字符串。');
    }
    if (!input.question.trim()) {
      throw new Error('请输入追问内容。');
    }
    if (input.reference !== undefined && input.reference !== null) {
      this.validateReference(input.reference);
    }
  }

  private validateReference(reference: NonNullable<FollowUpInput['reference']>) {
    const validBreadcrumb =
      Array.isArray(reference.breadcrumb) &&
      reference.breadcrumb.every(
        (crumb) => crumb && typeof crumb.chapterId === 'string' && typeof crumb.title === 'string',
      );
    if (
      typeof reference.selectedText !== 'string' ||
      typeof reference.startPassageId !== 'string' ||
      typeof reference.endPassageId !== 'string' ||
      typeof reference.startOffset !== 'number' ||
      typeof reference.endOffset !== 'number' ||
      !validBreadcrumb
    ) {
      throw new Error('引用字段无效。');
    }
  }

  private validateRetry(input: RetryMessageInput) {
    if (!input || typeof input !== 'object') {
      throw new Error('重试参数无效。');
    }
    if (typeof input.threadId !== 'string' || !input.threadId.trim()) {
      throw new Error('threadId 必须是非空字符串。');
    }
    if (typeof input.messageId !== 'string' || !input.messageId.trim()) {
      throw new Error('messageId 必须是非空字符串。');
    }
  }

  private emit(window: BrowserWindow, event: AiStreamEvent) {
    if (!window.isDestroyed()) {
      window.webContents.send(ipcChannels.aiStream, event);
    }
  }

  private requireSettings() {
    const value = this.settings.getAISettings();
    if (!value) {
      throw new Error('请先在设置页填写模型配置。');
    }
    return value;
  }
}

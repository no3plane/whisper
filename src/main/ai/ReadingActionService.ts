import type { BrowserWindow } from 'electron';
import type {
  AiStreamEvent, CreateConversationInput, DeleteThreadInput, FollowUpInput,
  ReadingSkillType, ReadingTargetType, ReadingThread, RetryMessageInput, RunReadingActionInput, ThreadMessage,
} from '../../shared/types';
import { ipcChannels } from '../../shared/ipc';
import type { LibraryService } from '../library/LibraryService';
import type { SettingsService } from '../settings/SettingsService';
import type { ThreadStore } from '../threads/ThreadStore';
import { AIProvider } from './AIProvider';
import { ContextAssembler } from './ContextAssembler';

const skills: Record<ReadingSkillType, { title: string; target: ReadingTargetType; instruction: string }> = {
  book_summary: { title: '总结全书', target: 'book', instruction: '总结全书的核心内容。' },
  book_framework: { title: '全书框架', target: 'book', instruction: '梳理全书的结构与核心框架。' },
  book_critique: { title: '评价全书', target: 'book', instruction: '评价全书的主要论点及其边界。' },
  chapter_summary: { title: '概括本章', target: 'chapter', instruction: '概括本章的核心内容。' },
  chapter_role: { title: '章节作用', target: 'chapter', instruction: '说明本章在全书中的作用。' },
  chapter_argument: { title: '梳理论证', target: 'chapter', instruction: '梳理本章的论证结构。' },
  plain_explanation: { title: '白话解释', target: 'selection', instruction: '用清楚的白话解释选区。' },
  concept_explanation: { title: '概念解释', target: 'selection', instruction: '解释选区中的关键概念。' },
  background_context: { title: '背景补全', target: 'selection', instruction: '补充理解选区所需的背景。' },
  example_analogy: { title: '举例 / 类比', target: 'selection', instruction: '用准确的例子或类比解释选区。' },
};

type Provider = Pick<AIProvider, 'streamGenerate'>;

export class ReadingActionService {
  private readonly assembler = new ContextAssembler();

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
    const targetTitle = input.target.type === 'book'
      ? '全书'
      : input.target.breadcrumb.at(-1)?.title || input.target.selectedText.slice(0, 12) || '解读目标';
    const thread = this.threads.createThread({
      bookId: input.bookId, title: `${targetTitle} · ${skill?.title ?? prompt.slice(0, 12)}`,
      target: input.target, skillType: input.skillType, contextStrategy: input.contextStrategy, status: 'streaming',
    });
    this.threads.addMessage({
      threadId: thread.id, role: 'user', content: prompt || skill!.title,
      contextStrategy: input.contextStrategy,
    });
    const assistant = this.threads.addMessage({
      threadId: thread.id, role: 'assistant', content: '', model: aiSettings.model,
      contextStrategy: input.contextStrategy, status: 'streaming',
    });
    const context = this.assembler.forReadingAction({
      strategy: input.contextStrategy, bookTitle: document.book.title, fullText: document.fullText,
      target: input.target, reference: null, skillInstruction: skill?.instruction ?? null, isInitialTurn: true,
      threadMessages: this.threads.listMessages(thread.id).filter((message) => message.id !== assistant.id),
      chapters: document.chapters, passages: document.passages, contextWindow: aiSettings.contextWindow,
    });
    return this.streamIntoMessage(thread, assistant, context, window);
  }

  async followUp(input: FollowUpInput, window: BrowserWindow) {
    if (!input.question.trim()) throw new Error('请输入追问内容。');
    const aiSettings = this.requireSettings();
    const thread = this.threads.getThread(input.threadId);
    this.threads.updateThreadStatus(thread.id, 'streaming');
    this.threads.addMessage({
      threadId: thread.id, role: 'user', content: input.question.trim(), reference: input.reference ?? null,
      contextStrategy: thread.contextStrategy,
    });
    const assistant = this.threads.addMessage({
      threadId: thread.id, role: 'assistant', content: '', model: aiSettings.model,
      contextStrategy: thread.contextStrategy, status: 'streaming',
    });
    const context = this.buildContext(thread, assistant, input.reference ?? null, false);
    return this.streamIntoMessage(thread, assistant, context, window);
  }

  async retry(input: RetryMessageInput, window: BrowserWindow) {
    const thread = this.threads.getThread(input.threadId);
    const messages = this.threads.listMessages(thread.id);
    const index = messages.findIndex((message) => message.id === input.messageId);
    const message = messages[index];
    if (!message || message.threadId !== thread.id) throw new Error('重试消息不属于当前会话。');
    if (message.role !== 'assistant' || message.status !== 'failed') throw new Error('只能重试失败的 assistant message。');
    const assistant = this.threads.resetMessageForRetry(message.id);
    const context = this.buildContext(thread, assistant, messages[index - 1]?.reference ?? null, index === 1);
    return this.streamIntoMessage(thread, assistant, context, window, [...messages.slice(0, index), assistant]);
  }

  deleteConversation(input: DeleteThreadInput) { this.threads.deleteThread(input.threadId); }

  /** @deprecated renderer 迁移期间保留。 */
  runReadingAction(input: RunReadingActionInput, window: BrowserWindow) {
    const document = this.library.openBook(input.bookId);
    const passage = document.passages.find((item) => item.id === input.passageId);
    return this.createConversation({
      bookId: input.bookId,
      target: {
        type: 'selection', chapterId: passage?.chapterId ?? null,
        startPassageId: input.passageId, endPassageId: input.passageId,
        selectedText: input.selectedText, startOffset: null, endOffset: null, breadcrumb: [],
      },
      skillType: input.actionType === 'structure_location' ? null : input.actionType,
      prompt: input.actionType === 'structure_location' ? '解释这段在全书结构中的位置。' : '',
      contextStrategy: input.contextStrategy,
    }, window);
  }

  private buildContext(thread: ReadingThread, assistant: ThreadMessage, reference: ThreadMessage['reference'], isInitialTurn: boolean, history?: ThreadMessage[]) {
    const aiSettings = this.requireSettings();
    const document = this.library.openBook(thread.bookId);
    return this.assembler.forReadingAction({
      strategy: thread.contextStrategy, bookTitle: document.book.title, fullText: document.fullText,
      target: thread.target, reference, skillInstruction: thread.skillType ? skills[thread.skillType].instruction : null,
      isInitialTurn, threadMessages: history ?? this.threads.listMessages(thread.id).filter((item) => item.id !== assistant.id),
      chapters: document.chapters, passages: document.passages, contextWindow: aiSettings.contextWindow,
    });
  }

  private async streamIntoMessage(thread: ReadingThread, assistant: ThreadMessage, context: Parameters<Provider['streamGenerate']>[1], window: BrowserWindow, startedMessages?: ThreadMessage[]) {
    const aiSettings = this.requireSettings();
    this.emit(window, { type: 'started', thread: this.threads.getThread(thread.id), messages: startedMessages ?? this.threads.listMessages(thread.id), assistantMessageId: assistant.id });
    try {
      const output = await this.provider.streamGenerate(aiSettings, context, {
        onChunk: (chunk) => this.emit(window, { type: 'chunk', threadId: thread.id, messageId: assistant.id, chunk }),
      });
      this.threads.updateMessage(assistant.id, { content: output.text, model: aiSettings.model, tokenUsage: output.usage, status: 'ready', error: null });
      this.threads.updateThreadStatus(thread.id, 'ready');
      const result = { thread: this.threads.getThread(thread.id), messages: this.threads.listMessages(thread.id) };
      this.emit(window, { type: 'done', ...result });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.threads.markMessageFailed(assistant.id, message);
      this.emit(window, { type: 'error', threadId: thread.id, messageId: assistant.id, message });
      throw error;
    }
  }

  private validateCreate(input: CreateConversationInput) {
    if (!input.skillType && !input.prompt.trim()) throw new Error('请输入问题。');
    if (input.skillType && skills[input.skillType].target !== input.target.type) throw new Error('所选技能不适用于当前解读目标。');
  }

  private emit(window: BrowserWindow, event: AiStreamEvent) {
    if (!window.isDestroyed()) window.webContents.send(ipcChannels.aiStream, event);
  }

  private requireSettings() {
    const value = this.settings.getAISettings();
    if (!value) throw new Error('请先在设置页填写模型配置。');
    return value;
  }
}

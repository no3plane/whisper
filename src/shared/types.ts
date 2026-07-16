export type PreprocessStatus = 'not_started' | 'running' | 'ready' | 'failed';
export type ContextStrategy = 'full_book' | 'compressed_book' | 'hybrid';
export type ReadingTargetType = 'book' | 'chapter' | 'selection';
export type ReadingSkillType =
  | 'book_summary'
  | 'book_framework'
  | 'book_critique'
  | 'chapter_summary'
  | 'chapter_role'
  | 'chapter_argument'
  | 'plain_explanation'
  | 'concept_explanation'
  | 'background_context'
  | 'example_analogy';

export interface ChapterCrumb {
  chapterId: string;
  title: string;
}

export interface RenderedTextSelection {
  selectedText: string;
  start: RenderedTextPosition;
  end: RenderedTextPosition;
}

/** Markdown block 渲染文本中的 UTF-16 位置。 */
export interface RenderedTextPosition {
  blockId: string;
  offsetInBlock: number;
}

export interface ReadingTarget {
  type: ReadingTargetType;
  chapterId: string | null;
  start: RenderedTextPosition | null;
  end: RenderedTextPosition | null;
  selectedText: string;
  breadcrumb: ChapterCrumb[];
}

export interface MessageReference extends RenderedTextSelection {
  breadcrumb: ChapterCrumb[];
}

export interface Book {
  id: string;
  title: string;
  author: string | null;
  originalFilePath: string;
  libraryFilePath: string;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string | null;
  preprocessStatus: PreprocessStatus;
  tokenEstimate: number;
  defaultContextStrategy: ContextStrategy;
  activeThreadId: string | null;
}

export interface Chapter {
  id: string;
  bookId: string;
  parentChapterId: string | null;
  title: string;
  level: number;
  order: number;
  headingBlockId: string;
  sourceStart: number;
  sourceEnd: number;
}

export interface MarkdownBlock {
  id: string;
  chapterId: string | null;
  order: number;
  type: string;
  sourceStart: number;
  sourceEnd: number;
  markdown: string;
  plainText: string;
}

export interface MarkdownAnalysis {
  chapters: Chapter[];
  blocks: MarkdownBlock[];
  structuredText: string;
  plainText: string;
}

export interface BookDocument {
  book: Book;
  markdown: string;
  chapters: Chapter[];
  blocks: MarkdownBlock[];
  resources: Record<string, string>;
  fullText: string;
}

export interface AISettings {
  baseURL: string;
  apiKey: string;
  model: string;
  contextWindow: number;
  defaultContextStrategy: ContextStrategy;
}

export interface ReadingThread {
  id: string;
  bookId: string;
  title: string;
  target: ReadingTarget;
  skillType: ReadingSkillType | null;
  contextStrategy: ContextStrategy;
  createdAt: string;
  updatedAt: string;
  status: 'streaming' | 'ready' | 'failed';
  lastError: string | null;
}

export interface ThreadMessage {
  id: string;
  threadId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
  model: string | null;
  tokenUsage: number | null;
  contextStrategy: ContextStrategy | null;
  effectiveContextStrategy: ContextStrategy | null;
  degradationReason: string | null;
  reference: MessageReference | null;
  status: 'streaming' | 'complete' | 'failed';
  error: string | null;
}

export interface ImportBooksResult {
  imported: Book[];
  failed: Array<{ fileName: string; reason: string }>;
}

export interface CreateConversationInput {
  bookId: string;
  target: ReadingTarget;
  skillType: ReadingSkillType | null;
  prompt: string;
  contextStrategy: ContextStrategy;
}

export interface FollowUpInput {
  threadId: string;
  question: string;
  reference?: MessageReference | null;
}

export interface RetryMessageInput {
  threadId: string;
  messageId: string;
}

export interface DeleteThreadInput {
  threadId: string;
}

export type AiStreamEvent =
  | {
      type: 'started';
      thread: ReadingThread;
      messages: ThreadMessage[];
      assistantMessageId: string;
    }
  | {
      type: 'chunk';
      threadId: string;
      messageId: string;
      chunk: string;
    }
  | {
      type: 'done';
      thread: ReadingThread;
      messages: ThreadMessage[];
    }
  | {
      type: 'error';
      threadId: string;
      messageId: string;
      message: string;
    };

export interface BookThreadsPayload {
  threads: Array<{ thread: ReadingThread; messages: ThreadMessage[] }>;
  activeThreadId: string | null;
}

export interface SetActiveThreadInput {
  bookId: string;
  threadId: string | null;
}

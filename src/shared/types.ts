export type BookFormat = 'markdown' | 'epub';
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

export interface SelectionSnapshot {
  selectedText: string;
  startPassageId: string;
  endPassageId: string;
  startOffset: number;
  endOffset: number;
}

export interface ReadingTarget {
  type: ReadingTargetType;
  chapterId: string | null;
  startPassageId: string | null;
  endPassageId: string | null;
  selectedText: string;
  startOffset: number | null;
  endOffset: number | null;
  breadcrumb: ChapterCrumb[];
}

export interface MessageReference extends SelectionSnapshot {
  breadcrumb: ChapterCrumb[];
}

export interface Book {
  id: string;
  title: string;
  author: string | null;
  format: BookFormat;
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
  startPassageId: string;
  endPassageId: string;
  summary: string | null;
}

export interface Passage {
  id: string;
  bookId: string;
  chapterId: string | null;
  order: number;
  text: string;
  sourceHref: string | null;
  sourceOffset: number;
}

export interface BookDocument {
  book: Book;
  chapters: Chapter[];
  passages: Passage[];
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

export interface ImportBookInput {
  filePath: string;
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

export type BookFormat = 'markdown' | 'epub';
export type PreprocessStatus = 'not_started' | 'running' | 'ready' | 'failed';
export type ContextStrategy = 'full_book' | 'compressed_book' | 'hybrid';
export type ReadingActionType = 'plain_explanation';

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
  chapterId: string | null;
  passageId: string | null;
  title: string;
  actionType: ReadingActionType;
  selectedText: string;
  contextStrategy: ContextStrategy;
  createdAt: string;
  updatedAt: string;
  status: 'streaming' | 'ready' | 'failed';
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
}

export interface ImportBookInput {
  filePath: string;
}

export interface RunReadingActionInput {
  bookId: string;
  selectedText: string;
  passageId: string | null;
  actionType: ReadingActionType;
  contextStrategy: ContextStrategy;
}

export interface FollowUpInput {
  threadId: string;
  question: string;
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

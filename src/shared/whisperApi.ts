import type {
  AISettings,
  AiStreamEvent,
  Book,
  BookDocument,
  BookThreadsPayload,
  ContextStrategy,
  CreateConversationInput,
  DeleteThreadInput,
  FollowUpInput,
  ImportBookInput,
  ImportBooksResult,
  ReadingThread,
  RetryMessageInput,
  SetActiveThreadInput,
  ThreadMessage,
} from './types';

interface ConversationResult {
  thread: ReadingThread;
  messages: ThreadMessage[];
}

export interface WhisperApi {
  settings: {
    get(): Promise<AISettings | null>;
    save(settings: AISettings): Promise<void>;
    testConnection(settings: AISettings): Promise<{ ok: boolean; message: string }>;
  };
  books: {
    importFiles(files: File[]): Promise<ImportBooksResult>;
    importMarkdown(input: ImportBookInput): Promise<Book>;
    importEpub(input: ImportBookInput): Promise<Book>;
    list(): Promise<Book[]>;
    open(bookId: string): Promise<BookDocument>;
    setActiveThread(input: SetActiveThreadInput): Promise<void>;
    setContextStrategy(input: { bookId: string; strategy: ContextStrategy }): Promise<void>;
  };
  ai: {
    createConversation(input: CreateConversationInput): Promise<ConversationResult>;
    followUp(input: FollowUpInput): Promise<ConversationResult>;
    retry(input: RetryMessageInput): Promise<ConversationResult>;
    onStream(listener: (event: AiStreamEvent) => void): () => void;
  };
  threads: {
    delete(input: DeleteThreadInput): Promise<void>;
    listByBook(bookId: string): Promise<ReadingThread[]>;
    listWithMessagesByBook(bookId: string): Promise<BookThreadsPayload>;
  };
}

import { z } from 'zod';

const nonEmptyString = z.string().trim().min(1);
const nullableString = z.string().nullable();

const contextStrategySchema = z.enum(['full_book', 'compressed_book', 'hybrid']);
const breadcrumbSchema = z
  .object({
    chapterId: z.string(),
    title: z.string(),
  })
  .strict();

const renderedTextPositionSchema = z
  .object({
    blockId: nonEmptyString,
    offsetInBlock: z.number().int().nonnegative(),
  })
  .strict();

const referenceSchema = z
  .object({
    selectedText: z.string(),
    start: renderedTextPositionSchema,
    end: renderedTextPositionSchema,
    breadcrumb: z.array(breadcrumbSchema),
  })
  .strict();

const readingTargetSchema = z
  .object({
    type: z.enum(['book', 'chapter', 'selection']),
    chapterId: nullableString,
    start: referenceSchema.shape.start.nullable(),
    end: referenceSchema.shape.end.nullable(),
    selectedText: z.string(),
    breadcrumb: z.array(breadcrumbSchema),
  })
  .strict();

const readingSkillSchema = z.enum([
  'book_summary',
  'book_framework',
  'book_critique',
  'chapter_summary',
  'chapter_role',
  'chapter_argument',
  'plain_explanation',
  'concept_explanation',
  'background_context',
  'example_analogy',
]);

export const ipcInputSchemas = {
  aiSettings: z
    .object({
      baseURL: z.string(),
      apiKey: z.string(),
      model: z.string(),
      contextWindow: z.number().int().positive(),
      defaultContextStrategy: contextStrategySchema,
    })
    .strict(),
  importBookFiles: z.array(nonEmptyString.regex(/\.md$/i, '仅支持 .md 文件')).min(1),
  bookId: nonEmptyString,
  setContextStrategy: z
    .object({ bookId: nonEmptyString, strategy: contextStrategySchema })
    .strict(),
  createConversation: z
    .object({
      bookId: nonEmptyString,
      target: readingTargetSchema,
      skillType: readingSkillSchema.nullable(),
      prompt: z.string(),
      contextStrategy: contextStrategySchema,
    })
    .strict(),
  followUp: z
    .object({
      threadId: nonEmptyString,
      question: z.string(),
      reference: referenceSchema.nullish(),
    })
    .strict(),
  retry: z.object({ threadId: nonEmptyString, messageId: nonEmptyString }).strict(),
  deleteThread: z.object({ threadId: nonEmptyString }).strict(),
  setActiveThread: z.object({ bookId: nonEmptyString, threadId: z.string().nullable() }).strict(),
  externalUrl: nonEmptyString
    .url()
    .refine((value) => /^(https?:|mailto:)/i.test(value), '不支持的链接协议'),
} as const;

export function parseIpcInput<T>(channel: string, schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (result.success) {
    return result.data;
  }

  const details = result.error.issues
    .map((issue) => `${issue.path.join('.') || 'input'}: ${issue.message}`)
    .join('; ');
  throw new Error(`IPC 参数无效（${channel}）：${details}`);
}

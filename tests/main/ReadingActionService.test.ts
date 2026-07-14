import { describe, expect, it } from 'vitest';
import { ReadingActionService } from '../../src/main/ai/ReadingActionService';
import type { ReadingTarget, ThreadMessage } from '../../src/shared/types';

const target: ReadingTarget = {
  type: 'selection',
  chapterId: 'c1',
  startPassageId: 'p1',
  endPassageId: 'p1',
  selectedText: '原文',
  startOffset: 0,
  endOffset: 2,
  breadcrumb: [{ chapterId: 'c1', title: '第一章' }],
};
const document = {
  book: { id: 'book-1', title: '测试书' },
  chapters: [
    {
      id: 'c1',
      bookId: 'book-1',
      parentChapterId: null,
      title: '第一章',
      level: 1,
      order: 0,
      startPassageId: 'p1',
      endPassageId: 'p1',
      summary: null,
    },
  ],
  passages: [
    {
      id: 'p1',
      bookId: 'book-1',
      chapterId: 'c1',
      order: 0,
      text: '原文',
      sourceHref: null,
      sourceOffset: 0,
    },
  ],
  fullText: '原文',
};

function setup(providerResult: 'success' | 'failure' = 'success') {
  let nextId = 0;
  const threads: any[] = [];
  const messages: ThreadMessage[] = [];
  const store = {
    createThread(input: any) {
      const item = { ...input, id: `t${++nextId}`, createdAt: '', updatedAt: '', lastError: null };
      threads.push(item);
      return item;
    },
    getThread(id: string) {
      const item = threads.find((thread) => thread.id === id);
      if (!item) throw new Error(`找不到 thread：${id}`);
      return item;
    },
    addMessage(input: any) {
      const item = {
        ...input,
        id: `m${++nextId}`,
        createdAt: '',
        model: input.model ?? null,
        tokenUsage: null,
        contextStrategy: input.contextStrategy ?? null,
        effectiveContextStrategy: null,
        degradationReason: null,
        reference: input.reference ?? null,
        status: input.status ?? 'complete',
        error: null,
      };
      messages.push(item);
      return item;
    },
    listMessages(threadId: string) {
      return messages.filter((message) => message.threadId === threadId);
    },
    updateMessage(id: string, patch: any) {
      Object.assign(
        messages.find((message) => message.id === id)!,
        patch,
      );
    },
    updateThreadStatus(id: string, status: string) {
      Object.assign(
        threads.find((thread) => thread.id === id),
        { status },
      );
    },
    markMessageFailed(id: string, error: string) {
      const message = messages.find((item) => item.id === id)!;
      Object.assign(message, { status: 'failed', error });
      Object.assign(
        threads.find((thread) => thread.id === message.threadId),
        { status: 'failed', lastError: error },
      );
      return message;
    },
    resetMessageForRetry(id: string) {
      const message = messages.find((item) => item.id === id)!;
      if (message.role !== 'assistant') throw new Error('只能重试 assistant message');
      Object.assign(message, { content: '', status: 'streaming', error: null });
      return message;
    },
    deleteThread(id: string) {
      const index = threads.findIndex((thread) => thread.id === id);
      if (index < 0) throw new Error('missing');
      threads.splice(index, 1);
    },
  };
  const provider = {
    async streamGenerate(_settings: any, _context: any, handlers: any) {
      if (providerResult === 'failure') throw new Error('网络错误');
      handlers.onChunk('回答');
      return { text: '回答', usage: 3 };
    },
  };
  const window = { isDestroyed: () => false, webContents: { send() {} } } as any;
  const service = new ReadingActionService(
    {
      getAISettings: () => ({
        baseURL: '',
        apiKey: '',
        model: 'test',
        contextWindow: 10000,
        defaultContextStrategy: 'full_book',
      }),
    } as any,
    { openBook: () => document } as any,
    store as any,
    provider as any,
  );
  return { service, store, threads, messages, window };
}

describe('ReadingActionService', () => {
  it('没有技能时拒绝空白首次问题', async () => {
    const { service, window } = setup();
    await expect(
      service.createConversation(
        { bookId: 'book-1', target, skillType: null, prompt: '  ', contextStrategy: 'full_book' },
        window,
      ),
    ).rejects.toThrow('请输入问题');
  });

  it('有效首次请求只创建一组 user/assistant message', async () => {
    const { service, messages, window } = setup();
    await service.createConversation(
      {
        bookId: 'book-1',
        target,
        skillType: 'plain_explanation',
        prompt: '',
        contextStrategy: 'full_book',
      },
      window,
    );
    expect(messages.map(({ role, status }) => ({ role, status }))).toEqual([
      { role: 'user', status: 'complete' },
      { role: 'assistant', status: 'complete' },
    ]);
  });

  it('拒绝与目标类型不匹配的技能', async () => {
    const { service, window } = setup();
    await expect(
      service.createConversation(
        {
          bookId: 'book-1',
          target,
          skillType: 'book_summary',
          prompt: '',
          contextStrategy: 'full_book',
        },
        window,
      ),
    ).rejects.toThrow('技能不适用于当前解读目标');
  });

  it('引用追问把 reference 写入 user message', async () => {
    const { service, messages, window } = setup();
    const created = await service.createConversation(
      {
        bookId: 'book-1',
        target,
        skillType: 'plain_explanation',
        prompt: '',
        contextStrategy: 'full_book',
      },
      window,
    );
    const reference = {
      selectedText: '引用',
      startPassageId: 'p1',
      endPassageId: 'p1',
      startOffset: 0,
      endOffset: 2,
      breadcrumb: [],
    };
    await service.followUp(
      { threadId: created.thread.id, question: '这是什么意思？', reference },
      window,
    );
    expect(messages.at(-2)?.reference).toEqual(reference);
  });

  it('流式失败会持久化 assistant message 的失败状态', async () => {
    const { service, messages, window } = setup('failure');
    await expect(
      service.createConversation(
        {
          bookId: 'book-1',
          target,
          skillType: 'plain_explanation',
          prompt: '',
          contextStrategy: 'full_book',
        },
        window,
      ),
    ).rejects.toThrow('网络错误');
    expect(messages.at(-1)).toMatchObject({
      role: 'assistant',
      status: 'failed',
      error: '网络错误',
    });
  });

  it('上下文组装失败也会把占位消息和会话标记为失败', async () => {
    const fixture = setup();
    (fixture.service as any).settings = {
      getAISettings: () => ({
        baseURL: '',
        apiKey: '',
        model: 'test',
        contextWindow: 1,
        defaultContextStrategy: 'full_book',
      }),
    };
    await expect(
      fixture.service.createConversation(
        {
          bookId: 'book-1',
          target,
          skillType: 'plain_explanation',
          prompt: '',
          contextStrategy: 'full_book',
        },
        fixture.window,
      ),
    ).rejects.toThrow('超过模型窗口');
    expect(fixture.messages.at(-1)).toMatchObject({ status: 'failed' });
    expect(fixture.threads[0]).toMatchObject({ status: 'failed' });
  });

  it('同一会话生成中拒绝并发追问', async () => {
    const fixture = setup();
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const provider = {
      async streamGenerate() {
        await pending;
        return { text: '回答', usage: 1 };
      },
    };
    const service = new ReadingActionService(
      (fixture.service as any).settings,
      (fixture.service as any).library,
      fixture.store as any,
      provider as any,
    );
    const first = service.createConversation(
      {
        bookId: 'book-1',
        target,
        skillType: 'plain_explanation',
        prompt: '',
        contextStrategy: 'full_book',
      },
      fixture.window,
    );
    await Promise.resolve();
    await expect(
      service.followUp({ threadId: fixture.threads[0].id, question: '并发问题' }, fixture.window),
    ).rejects.toThrow('正在生成回答');
    release();
    await first;
  });

  it('retry 复用失败 assistant message ID 且不新增 message', async () => {
    const failed = setup('failure');
    await expect(
      failed.service.createConversation(
        {
          bookId: 'book-1',
          target,
          skillType: 'plain_explanation',
          prompt: '',
          contextStrategy: 'full_book',
        },
        failed.window,
      ),
    ).rejects.toThrow();
    const assistant = failed.messages.at(-1)!;
    const success = {
      async streamGenerate(_s: any, _c: any, handlers: any) {
        handlers.onChunk('重试');
        return { text: '重试', usage: 2 };
      },
    };
    const service = new ReadingActionService(
      (failed.service as any).settings,
      (failed.service as any).library,
      failed.store as any,
      success as any,
    );
    const before = failed.messages.length;
    await service.retry({ threadId: assistant.threadId, messageId: assistant.id }, failed.window);
    expect(failed.messages).toHaveLength(before);
    expect(failed.messages.at(-1)).toMatchObject({
      id: assistant.id,
      content: '重试',
      status: 'complete',
    });
  });

  it('retry 上下文只包含失败 assistant 之前的持久化消息', async () => {
    const failed = setup('failure');
    await expect(
      failed.service.createConversation(
        {
          bookId: 'book-1',
          target,
          skillType: null,
          prompt: '最初问题',
          contextStrategy: 'full_book',
        },
        failed.window,
      ),
    ).rejects.toThrow();
    const assistant = failed.messages.at(-1)!;
    failed.store.addMessage({
      threadId: assistant.threadId,
      role: 'user',
      content: '失败后的问题',
    });
    failed.store.addMessage({
      threadId: assistant.threadId,
      role: 'assistant',
      content: '失败后的回答',
    });
    let context: any;
    const provider = {
      async streamGenerate(_s: any, value: any) {
        context = value;
        return { text: '重试', usage: 2 };
      },
    };
    const service = new ReadingActionService(
      (failed.service as any).settings,
      (failed.service as any).library,
      failed.store as any,
      provider as any,
    );
    await service.retry({ threadId: assistant.threadId, messageId: assistant.id }, failed.window);
    const contents = context.messages.map((message: any) => message.content).join('\n');
    expect(contents).toContain('最初问题');
    expect(contents).not.toContain('失败后的问题');
    expect(contents).not.toContain('失败后的回答');
  });

  it.each([
    [
      { bookId: 'book-1', target, skillType: null, contextStrategy: 'full_book' },
      'prompt 必须是字符串',
    ],
    [
      {
        bookId: 'book-1',
        target: { ...target, type: 'unknown' },
        skillType: null,
        prompt: '问题',
        contextStrategy: 'full_book',
      },
      '解读目标类型无效',
    ],
    [
      {
        bookId: 'book-1',
        target: { ...target, selectedText: 42 },
        skillType: null,
        prompt: '问题',
        contextStrategy: 'full_book',
      },
      '解读目标字段无效',
    ],
    [
      { bookId: 'book-1', target, skillType: 'unknown', prompt: '', contextStrategy: 'full_book' },
      '技能类型无效',
    ],
    [
      { bookId: 'book-1', target, skillType: null, prompt: '问题', contextStrategy: 'invalid' },
      '全书认知策略无效',
    ],
  ])('createConversation 拒绝畸形运行时输入 %#', async (input, message) => {
    const { service, window } = setup();
    await expect(service.createConversation(input as any, window)).rejects.toThrow(message);
  });

  it.each([
    [{ ...target, type: 'chapter', chapterId: null }, '章节目标必须包含 chapterId'],
    [
      { ...target, type: 'selection', startPassageId: null },
      '框选目标必须包含 passage、文本和偏移量',
    ],
    [{ ...target, type: 'selection', selectedText: '' }, '框选目标必须包含 passage、文本和偏移量'],
    [{ ...target, type: 'selection', startOffset: null }, '框选目标必须包含 passage、文本和偏移量'],
  ])('createConversation 拒绝缺少类型必要字段的目标 %#', async (invalidTarget, message) => {
    const { service, window } = setup();
    await expect(
      service.createConversation(
        {
          bookId: 'book-1',
          target: invalidTarget as any,
          skillType: null,
          prompt: '问题',
          contextStrategy: 'full_book',
        },
        window,
      ),
    ).rejects.toThrow(message);
  });

  it('followUp 和 retry 对字符串字段做运行时校验', async () => {
    const { service, window } = setup();
    await expect(service.followUp({ threadId: 1, question: null } as any, window)).rejects.toThrow(
      'threadId 必须是非空字符串',
    );
    await expect(service.followUp({ threadId: 't1', question: 1 } as any, window)).rejects.toThrow(
      'question 必须是字符串',
    );
    await expect(
      service.followUp({ threadId: 't1', question: '问题', reference: {} } as any, window),
    ).rejects.toThrow('引用字段无效');
    await expect(service.retry({ threadId: '', messageId: 1 } as any, window)).rejects.toThrow(
      'threadId 必须是非空字符串',
    );
    await expect(service.retry({ threadId: 't1', messageId: 1 } as any, window)).rejects.toThrow(
      'messageId 必须是非空字符串',
    );
  });

  it('deleteConversation 委托 ThreadStore', () => {
    const { service, store, threads } = setup();
    threads.push({ id: 't1', status: 'ready' });
    let deleted = '';
    store.deleteThread = (id: string) => {
      deleted = id;
    };
    service.deleteConversation({ threadId: 't1' });
    expect(deleted).toBe('t1');
  });

  it('拒绝删除生成中的会话', () => {
    const { service, threads } = setup();
    threads.push({ id: 't1', status: 'streaming' });
    expect(() => service.deleteConversation({ threadId: 't1' })).toThrow('生成中的会话不能删除');
  });

  it.each([null, {}, { threadId: '' }, { threadId: 1 }])(
    'deleteConversation 拒绝畸形输入 %#',
    (input) => {
      const { service } = setup();
      expect(() => service.deleteConversation(input as any)).toThrow('删除会话参数无效');
    },
  );
});

import { describe, expect, it } from 'vitest';
import { ContextAssembler } from '../../src/main/ai/ContextAssembler';

describe('ContextAssembler', () => {
  it('full_book 策略包含完整书籍、选中文本和当前 thread 历史', () => {
    const assembler = new ContextAssembler();
    const result = assembler.forReadingAction({
      strategy: 'full_book',
      bookTitle: '测试书',
      fullText: '第一章全文\n\n第二章全文',
      selectedText: '第一章全文',
      nearbyText: '第一章全文',
      actionInstruction: '请白话解释这段。',
      threadMessages: [{ role: 'user', content: '之前的问题' }],
    });

    expect(result.system).toContain('尽量让全书在场');
    expect(result.user).toContain('第一章全文\n\n第二章全文');
    expect(result.user).toContain('请白话解释这段。');
    expect(result.user).toContain('之前的问题');
  });

  it('非 full_book 策略在纵向切片中明确报错', () => {
    const assembler = new ContextAssembler();

    expect(() =>
      assembler.forReadingAction({
        strategy: 'hybrid',
        bookTitle: '测试书',
        fullText: '全文',
        selectedText: '片段',
        nearbyText: '附近',
        actionInstruction: '解释',
        threadMessages: [],
      }),
    ).toThrow('当前纵向切片只支持 full_book 策略');
  });
});

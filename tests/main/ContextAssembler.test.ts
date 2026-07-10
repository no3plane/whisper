import { describe, expect, it } from 'vitest';
import { ContextAssembler } from '../../src/main/ai/ContextAssembler';
const chapters = [
  { id: 'c1', bookId: 'book-1', parentChapterId: null, title: '第一章', level: 1, order: 0, startPassageId: 'p1', endPassageId: 'p1', summary: null },
  { id: 'c2', bookId: 'book-1', parentChapterId: null, title: '第二章', level: 1, order: 1, startPassageId: 'p2', endPassageId: 'p2', summary: null },
];
const passages = [
  { id: 'p1', bookId: 'book-1', chapterId: 'c1', order: 0, text: '当前章节讨论自由意志。', sourceHref: null, sourceOffset: 0 },
  { id: 'p2', bookId: 'book-1', chapterId: 'c2', order: 1, text: '后续章节重新讨论自由意志。', sourceHref: null, sourceOffset: 1 },
];
const common = { bookTitle: '测试书', fullText: '第一章全文\n\n第二章全文', selectedText: '自由意志', nearbyText: '附近', actionInstruction: '解释', threadMessages: [{ role: 'user' as const, content: '追问' }], chapters, passages, currentChapterId: 'c1', contextWindow: 10000 };

describe('ContextAssembler', () => {
  it('full_book 包含完整书籍与 thread 历史', () => {
    const result = new ContextAssembler().forReadingAction({ ...common, strategy: 'full_book' });
    expect(result.effectiveStrategy).toBe('full_book');
    expect(result.messages[0]?.content).toContain(common.fullText);
    expect(result.messages).toContainEqual({ role: 'user', content: '追问' });
  });

  it('compressed_book 使用章节采样而不放入全文', () => {
    const result = new ContextAssembler().forReadingAction({ ...common, strategy: 'compressed_book' });
    expect(result.messages[0]?.content).toContain('第一章');
    expect(result.messages[0]?.content).not.toContain('第二章全文');
  });

  it('hybrid 包含压缩表示、当前章节与相关锚点', () => {
    const result = new ContextAssembler().forReadingAction({ ...common, strategy: 'hybrid' });
    expect(result.messages[0]?.content).toContain('当前章节讨论自由意志');
    expect(result.messages[0]?.content).toContain('后续章节重新讨论自由意志');
  });

  it('full_book 超预算时降级 hybrid', () => {
    const result = new ContextAssembler().forReadingAction({ ...common, strategy: 'full_book', fullText: '长'.repeat(5000), contextWindow: 2000, passages: [] });
    expect(result.effectiveStrategy).toBe('hybrid');
    expect(result.degradationReason).toContain('已降级');
  });
});

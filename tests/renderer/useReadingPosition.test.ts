import { describe, expect, it } from 'vitest';
import { chapterAtReadingLine } from '../../src/renderer/features/book-outline/useReadingPosition';

describe('chapterAtReadingLine', () => {
  const passages = [
    { id: 'p1', chapterId: 'c1' },
    { id: 'p2', chapterId: 'c2' },
    { id: 'p3', chapterId: 'c3' },
  ];
  const tops = new Map([
    ['p1', 100],
    ['p2', 300],
    ['p3', 500],
  ]);

  it('选择最后一个越过阅读基准线的 passage', () => {
    expect(chapterAtReadingLine(passages, (id) => tops.get(id) ?? null, 350)).toBe('c2');
  });

  it('基准线位于首段之前时选择首段', () => {
    expect(chapterAtReadingLine(passages, (id) => tops.get(id) ?? null, 50)).toBe('c1');
  });

  it('跳过已经不在 DOM 中的 passage', () => {
    expect(chapterAtReadingLine(passages, (id) => (id === 'p2' ? null : tops.get(id)!), 350)).toBe(
      'c1',
    );
  });

  it('使用二分查找定位长书中的当前 passage', () => {
    const longBook = Array.from({ length: 4096 }, (_, index) => ({
      id: `p${index}`,
      chapterId: `c${index}`,
    }));
    let measurements = 0;
    const result = chapterAtReadingLine(
      longBook,
      (id) => {
        measurements += 1;
        return Number(id.slice(1)) * 10;
      },
      20_005,
    );

    expect(result).toBe('c2000');
    expect(measurements).toBeLessThanOrEqual(13);
  });
});

import { describe, expect, it } from 'vitest';
import { openDatabase } from '../../src/main/storage/sqlite';
import { schemaSql } from '../../src/main/storage/schema';

describe('当前数据库结构', () => {
  it('reading_threads 只包含当前会话模型字段', () => {
    const db = openDatabase(':memory:');
    db.exec(schemaSql);
    const columns = db.prepare('PRAGMA table_info(reading_threads)').all() as Array<{
      name: string;
    }>;
    const names = columns.map((column) => column.name);

    expect(names).not.toContain('chapter_id');
    expect(names).not.toContain('passage_id');
    expect(names).not.toContain('action_type');
    expect(names).not.toContain('selected_text');
    expect(names).toContain('target_type');
    expect(names).toContain('skill_type');
    db.close();
  });

  it('事务失败时回滚全部写入', () => {
    const db = openDatabase(':memory:');
    db.exec('CREATE TABLE values_for_test (value TEXT NOT NULL)');

    expect(() =>
      db.transaction(() => {
        db.prepare('INSERT INTO values_for_test (value) VALUES (?)').run('不应保留');
        throw new Error('模拟失败');
      })(),
    ).toThrow('模拟失败');

    expect(db.prepare('SELECT value FROM values_for_test').all()).toEqual([]);
    db.close();
  });
});

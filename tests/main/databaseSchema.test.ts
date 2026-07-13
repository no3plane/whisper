import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { schemaSql } from '../../src/main/storage/schema';

describe('当前数据库结构', () => {
  it('reading_threads 只包含当前会话模型字段', () => {
    const db = new Database(':memory:');
    db.exec(schemaSql);
    const columns = db.prepare('PRAGMA table_info(reading_threads)').all() as Array<{ name: string }>;
    const names = columns.map((column) => column.name);

    expect(names).not.toContain('chapter_id');
    expect(names).not.toContain('passage_id');
    expect(names).not.toContain('action_type');
    expect(names).not.toContain('selected_text');
    expect(names).toContain('target_type');
    expect(names).toContain('skill_type');
    db.close();
  });
});

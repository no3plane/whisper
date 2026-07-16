import { describe, expect, it } from 'vitest';
import {
  buildThreadTitle,
  isSkillAllowed,
  labelForSkill,
  skillsForTarget,
} from '../../src/shared/skills';

describe('reading skills', () => {
  it('按目标类型返回不同技能并拒绝不适用技能', () => {
    expect(skillsForTarget('selection').map((item) => item.id)).toContain('plain_explanation');
    expect(skillsForTarget('book').map((item) => item.id)).toContain('book_framework');
    expect(isSkillAllowed('chapter', 'plain_explanation')).toBe(false);
    expect(labelForSkill('plain_explanation')).toBe('白话解释');
  });

  it('每类解读方式数量适合单行展示', () => {
    expect(skillsForTarget('book').map(({ label }) => label)).toEqual([
      '总结全书',
      '提炼框架',
      '评价全书',
    ]);
    expect(skillsForTarget('chapter').map(({ label }) => label)).toEqual([
      '概括本章',
      '章节作用',
      '梳理论证',
    ]);
    expect(skillsForTarget('selection').map(({ label }) => label)).toEqual([
      '白话解释',
      '解释概念',
      '补充背景',
      '举例类比',
    ]);
  });

  it('优先用目标和技能生成标题，无技能时使用首问', () => {
    expect(buildThreadTitle({ targetLabel: '第三章', skillLabel: '梳理论证', question: '' })).toBe(
      '第三章 · 梳理论证',
    );
    expect(
      buildThreadTitle({
        targetLabel: '全书',
        skillLabel: null,
        question: '作者为什么反对经验主义？',
      }),
    ).toBe('全书 · 作者为什么反对经验主义？');
  });

  it('标题压缩换行并按 Unicode code point 截断', () => {
    expect(
      buildThreadTitle({
        targetLabel: '框选内容',
        skillLabel: null,
        question: '第一行\n第二行有一个很长很长的追问用于测试截断',
      }),
    ).toBe('框选内容 · 第一行 第二行有一个很…');
  });
});

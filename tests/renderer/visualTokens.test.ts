import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('src/renderer/styles.css', 'utf8');
const readerCss = readFileSync('src/renderer/pages/reader-page/ReaderPage.module.css', 'utf8');
const aiPanelCss = readFileSync(
  'src/renderer/features/conversation/RightAiPanel.module.css',
  'utf8',
);
const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
  dependencies: Record<string, string>;
};

describe('renderer visual system', () => {
  it('声明浅色语义 token 和系统字体栈', () => {
    for (const token of [
      '--color-canvas-desk',
      '--color-surface-paper',
      '--color-structure-walnut',
      '--color-accent-amber',
      '--color-feedback-danger',
      '--font-reading',
      '--font-interface',
      '--reader-measure',
    ]) {
      expect(css).toContain(token);
    }
  });

  it('不加载外部字体、Tailwind 或 shadcn', () => {
    expect(css).not.toMatch(/@font-face|fonts\.(googleapis|gstatic)\.com/);
    expect(packageJson.dependencies['@base-ui/react']).toBeDefined();
    expect(packageJson.dependencies.tailwindcss).toBeUndefined();
    expect(packageJson.dependencies['shadcn-ui']).toBeUndefined();
  });

  it('提供 reduced motion 和键盘焦点策略', () => {
    expect(css).toContain('prefers-reduced-motion: reduce');
    expect(css).toContain(':focus-visible');
    expect(css).toContain('transition-duration: 0.01ms !important');
  });

  it('窄窗口缩小目录、AI 面板和阅读纸张留白，同时保留三栏可达', () => {
    expect(readerCss).toMatch(/@media\s*\([^)]*max-width:\s*1100px[^)]*\)/);
    expect(readerCss).toMatch(/@media[^]*\.layout\s*{[^]*grid-template-columns:/);
    expect(readerCss).toMatch(/@media[^]*\.readerPaper\s*{[^]*padding:/);
    expect(aiPanelCss).toMatch(/@media\s*\([^)]*max-width:\s*1100px[^)]*\)/);
    expect(aiPanelCss).toMatch(/@media[^]*\.panel\s*{[^]*padding:/);
  });
});

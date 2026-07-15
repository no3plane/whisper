import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/renderer/App';

vi.mock('../../src/renderer/api/whisper', () => ({ getWhisperApi: vi.fn(() => ({})) }));
vi.mock('../../src/renderer/features/settings/SettingsPanel', () => ({
  SettingsPanel: () => <aside>设置</aside>,
}));
vi.mock('../../src/renderer/pages/library-page/LibraryPage', () => ({
  LibraryPage: () => <section>书库内容</section>,
}));

afterEach(cleanup);

describe('App', () => {
  it('以品牌名和产品定位作为首页标题', () => {
    render(<App />);

    const title = screen.getByRole('heading', { level: 1, name: 'Whisper' });
    expect(title.nextElementSibling?.textContent).toBe('你的本地阅读伴侣');
    expect(screen.queryByRole('heading', { level: 1, name: '我的书房' })).toBeNull();
  });
});

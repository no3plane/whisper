import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsPanel } from '../../src/renderer/features/settings/SettingsPanel';
import type { AISettings } from '../../src/shared/types';

const { api } = vi.hoisted(() => ({
  api: {
    settings: {
      get: vi.fn(),
      save: vi.fn(),
      testConnection: vi.fn(),
    },
  },
}));

vi.mock('../../src/renderer/api/whisper', () => ({ whisper: api }));

const savedSettings: AISettings = {
  baseURL: 'https://api.example.com/v1',
  apiKey: 'secret-key',
  model: 'gpt-5',
  contextWindow: 128000,
  defaultContextStrategy: 'hybrid',
};

beforeEach(() => {
  vi.clearAllMocks();
  api.settings.get.mockResolvedValue(savedSettings);
  api.settings.save.mockResolvedValue(undefined);
  api.settings.testConnection.mockResolvedValue({ ok: true, message: '连接成功。' });
});

afterEach(cleanup);

describe('SettingsPanel', () => {
  it('不显示 WORKBENCH 装饰文案', () => {
    render(<SettingsPanel />);

    expect(screen.queryByText('WORKBENCH')).toBeNull();
  });

  it('加载并保存完整模型设置', async () => {
    render(<SettingsPanel />);

    const model = await screen.findByRole('textbox', { name: 'Model' });
    expect((screen.getByLabelText('Base URL') as HTMLInputElement).value).toBe(
      savedSettings.baseURL,
    );
    expect((screen.getByLabelText('API Key') as HTMLInputElement).type).toBe('password');
    expect((screen.getByLabelText('Context Window') as HTMLInputElement).type).toBe('number');
    expect(
      (screen.getByRole('combobox', { name: '默认上下文策略' }) as HTMLSelectElement).value,
    ).toBe('hybrid');

    fireEvent.change(model, { target: { value: 'gpt-5-mini' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() =>
      expect(api.settings.save).toHaveBeenCalledWith({
        ...savedSettings,
        model: 'gpt-5-mini',
      }),
    );
    expect(screen.getByRole('status').textContent).toContain('已保存设置');
  });

  it('使用当前完整设置测试连接并反馈结果', async () => {
    render(<SettingsPanel />);
    await screen.findByDisplayValue(savedSettings.model);

    fireEvent.click(screen.getByRole('button', { name: '测试连接' }));

    await waitFor(() => expect(api.settings.testConnection).toHaveBeenCalledWith(savedSettings));
    expect(screen.getByRole('status').textContent).toContain('连接成功');
  });

  it('下一次操作失败时清除旧的成功反馈', async () => {
    render(<SettingsPanel />);
    await screen.findByDisplayValue(savedSettings.model);

    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect((await screen.findByRole('status')).textContent).toContain('已保存设置');

    api.settings.testConnection.mockRejectedValueOnce(new Error('连接失败'));
    fireEvent.click(screen.getByRole('button', { name: '测试连接' }));

    expect((await screen.findByRole('alert')).textContent).toContain('连接失败');
    expect(screen.queryByText('已保存设置。')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it.each([
    ['加载', () => api.settings.get.mockRejectedValueOnce(new Error('读取设置失败'))],
    ['保存', () => api.settings.save.mockRejectedValueOnce(new Error('保存设置失败'))],
    ['测试连接', () => api.settings.testConnection.mockRejectedValueOnce(new Error('连接失败'))],
  ])('%s失败时显示警报', async (operation, reject) => {
    reject();
    render(<SettingsPanel />);

    if (operation !== '加载') {
      await screen.findByDisplayValue(savedSettings.model);
      fireEvent.click(
        screen.getByRole('button', { name: operation === '保存' ? '保存' : '测试连接' }),
      );
    }

    expect(await screen.findByRole('alert')).toBeTruthy();
  });
});

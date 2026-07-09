import { useEffect, useState } from 'react';
import type { AISettings } from '../../shared/types';
import { whisper } from '../api/whisper';

const defaultSettings: AISettings = {
  baseURL: '',
  apiKey: '',
  model: '',
  contextWindow: 128000,
  defaultContextStrategy: 'full_book',
};

export function SettingsPanel() {
  const [settings, setSettings] = useState<AISettings>(defaultSettings);
  const [message, setMessage] = useState('');

  useEffect(() => {
    void whisper.settings.get().then((saved) => {
      if (saved) setSettings(saved);
    });
  }, []);

  async function save() {
    await whisper.settings.save(settings);
    setMessage('已保存设置。');
  }

  async function test() {
    const result = await whisper.settings.testConnection(settings);
    setMessage(result.message);
  }

  return (
    <section className="settings-panel">
      <h2>模型设置</h2>
      <label>
        Base URL
        <input value={settings.baseURL} onChange={(event) => setSettings({ ...settings, baseURL: event.target.value })} />
      </label>
      <label>
        API Key
        <input
          type="password"
          value={settings.apiKey}
          onChange={(event) => setSettings({ ...settings, apiKey: event.target.value })}
        />
      </label>
      <label>
        Model
        <input value={settings.model} onChange={(event) => setSettings({ ...settings, model: event.target.value })} />
      </label>
      <label>
        Context Window
        <input
          type="number"
          value={settings.contextWindow}
          onChange={(event) => setSettings({ ...settings, contextWindow: Number(event.target.value) })}
        />
      </label>
      <div className="button-row">
        <button onClick={save}>保存</button>
        <button onClick={test}>测试连接</button>
      </div>
      {message && <p className="muted">{message}</p>}
    </section>
  );
}

import { useEffect, useState } from 'react';
import { Field } from '@base-ui/react/field';
import type { AISettings } from '../../../shared/types';
import { whisper } from '../../api/whisper';
import styles from './SettingsPanel.module.css';

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
  const [error, setError] = useState('');

  useEffect(() => {
    void whisper.settings
      .get()
      .then((saved) => {
        if (saved) {
          setSettings(saved);
        }
      })
      .catch((reason) => setError(messageOf(reason)));
  }, []);

  async function save() {
    await run(async () => {
      await whisper.settings.save(settings);
      setMessage('已保存设置。');
    });
  }

  async function test() {
    await run(async () => {
      const result = await whisper.settings.testConnection(settings);
      setMessage(result.message);
    });
  }

  async function run(operation: () => Promise<void>) {
    setError('');
    setMessage('');
    try {
      await operation();
    } catch (reason) {
      setError(messageOf(reason));
    }
  }

  return (
    <aside className={styles.panel} aria-labelledby="settings-title">
      <header className={styles.header}>
        <h2 id="settings-title">模型设置</h2>
        <p>连接你的模型服务，并选择阅读时默认使用的上下文。</p>
      </header>
      <div className={styles.fields}>
        <Field.Root className={styles.field}>
          <Field.Label>Base URL</Field.Label>
          <Field.Control
            value={settings.baseURL}
            onChange={(event) => setSettings({ ...settings, baseURL: event.target.value })}
          />
        </Field.Root>
        <Field.Root className={styles.field}>
          <Field.Label>API Key</Field.Label>
          <Field.Control
            type="password"
            value={settings.apiKey}
            onChange={(event) => setSettings({ ...settings, apiKey: event.target.value })}
          />
        </Field.Root>
        <Field.Root className={styles.field}>
          <Field.Label>Model</Field.Label>
          <Field.Control
            value={settings.model}
            onChange={(event) => setSettings({ ...settings, model: event.target.value })}
          />
        </Field.Root>
        <Field.Root className={styles.field}>
          <Field.Label>Context Window</Field.Label>
          <Field.Control
            type="number"
            value={settings.contextWindow}
            onChange={(event) =>
              setSettings({ ...settings, contextWindow: Number(event.target.value) })
            }
          />
        </Field.Root>
        <label className={styles.field}>
          默认上下文策略
          <select
            value={settings.defaultContextStrategy}
            onChange={(event) =>
              setSettings({
                ...settings,
                defaultContextStrategy: event.target.value as AISettings['defaultContextStrategy'],
              })
            }
          >
            <option value="full_book">完整全书</option>
            <option value="compressed_book">压缩全书</option>
            <option value="hybrid">混合</option>
          </select>
        </label>
      </div>
      <div className={styles.buttonRow}>
        <button className={styles.primaryButton} onClick={save}>
          保存
        </button>
        <button className={styles.secondaryButton} onClick={test}>
          测试连接
        </button>
      </div>
      {message ? (
        <p className={styles.status} role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </aside>
  );
}

function messageOf(reason: unknown) {
  return reason instanceof Error ? reason.message : String(reason);
}

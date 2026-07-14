import { useState } from 'react';
import { getWhisperApi } from './api/whisper';
import { SettingsPanel } from './features/settings/SettingsPanel';
import { LibraryPage } from './pages/library-page/LibraryPage';
import { ReaderPage } from './pages/reader-page/ReaderPage';
import styles from './App.module.css';

export function App() {
  const [activeBookId, setActiveBookId] = useState<string | null>(null);

  try {
    getWhisperApi();
  } catch (error) {
    return (
      <main className={styles.shell}>
        <h1>Whisper Reading Copilot</h1>
        <p className="error">{error instanceof Error ? error.message : String(error)}</p>
      </main>
    );
  }

  if (activeBookId) {
    return <ReaderPage bookId={activeBookId} onBack={() => setActiveBookId(null)} />;
  }

  return (
    <main className={styles.shell}>
      <header className={styles.topBar}>
        <h1>Whisper Reading Copilot</h1>
      </header>
      <div className={styles.homeGrid}>
        <LibraryPage onOpenBook={setActiveBookId} />
        <SettingsPanel />
      </div>
    </main>
  );
}

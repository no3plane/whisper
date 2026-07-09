import { useState } from 'react';
import { getWhisperApi } from './api/whisper';
import { SettingsPanel } from './components/SettingsPanel';
import { LibraryPage } from './pages/LibraryPage';
import { ReaderPage } from './pages/ReaderPage';

export function App() {
  const [activeBookId, setActiveBookId] = useState<string | null>(null);

  try {
    getWhisperApi();
  } catch (error) {
    return (
      <main className="app-shell">
        <h1>Whisper Reading Copilot</h1>
        <p className="error">{error instanceof Error ? error.message : String(error)}</p>
      </main>
    );
  }

  if (activeBookId) {
    return <ReaderPage bookId={activeBookId} onBack={() => setActiveBookId(null)} />;
  }

  return (
    <main className="app-shell">
      <header className="top-bar">
        <h1>Whisper Reading Copilot</h1>
      </header>
      <div className="home-grid">
        <LibraryPage onOpenBook={setActiveBookId} />
        <SettingsPanel />
      </div>
    </main>
  );
}

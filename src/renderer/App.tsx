import { useState } from 'react';
import { SettingsPanel } from './components/SettingsPanel';
import { LibraryPage } from './pages/LibraryPage';
import { ReaderPage } from './pages/ReaderPage';

export function App() {
  const [activeBookId, setActiveBookId] = useState<string | null>(null);

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

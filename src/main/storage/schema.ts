export const schemaSql = `
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS books (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  author TEXT,
  format TEXT NOT NULL,
  original_file_path TEXT NOT NULL,
  library_file_path TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_opened_at TEXT,
  preprocess_status TEXT NOT NULL,
  token_estimate INTEGER NOT NULL,
  default_context_strategy TEXT NOT NULL,
  active_thread_id TEXT
);

CREATE TABLE IF NOT EXISTS chapters (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL,
  parent_chapter_id TEXT,
  title TEXT NOT NULL,
  level INTEGER NOT NULL,
  chapter_order INTEGER NOT NULL,
  start_passage_id TEXT NOT NULL,
  end_passage_id TEXT NOT NULL,
  summary TEXT,
  FOREIGN KEY(book_id) REFERENCES books(id)
);

CREATE TABLE IF NOT EXISTS passages (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL,
  chapter_id TEXT,
  passage_order INTEGER NOT NULL,
  text TEXT NOT NULL,
  source_href TEXT,
  source_offset INTEGER NOT NULL,
  FOREIGN KEY(book_id) REFERENCES books(id),
  FOREIGN KEY(chapter_id) REFERENCES chapters(id)
);

CREATE TABLE IF NOT EXISTS reading_threads (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL,
  chapter_id TEXT,
  passage_id TEXT,
  title TEXT NOT NULL,
  action_type TEXT NOT NULL DEFAULT '',
  selected_text TEXT NOT NULL DEFAULT '',
  target_type TEXT NOT NULL DEFAULT 'book',
  target_chapter_id TEXT,
  target_start_passage_id TEXT,
  target_end_passage_id TEXT,
  target_selected_text TEXT NOT NULL DEFAULT '',
  target_start_offset INTEGER,
  target_end_offset INTEGER,
  target_breadcrumb_json TEXT NOT NULL DEFAULT '[]',
  skill_type TEXT,
  context_strategy TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  status TEXT NOT NULL,
  last_error TEXT,
  FOREIGN KEY(book_id) REFERENCES books(id)
);

CREATE TABLE IF NOT EXISTS thread_messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  model TEXT,
  token_usage INTEGER,
  context_strategy TEXT,
  effective_context_strategy TEXT,
  degradation_reason TEXT,
  reference_json TEXT,
  status TEXT NOT NULL DEFAULT 'complete',
  error TEXT,
  FOREIGN KEY(thread_id) REFERENCES reading_threads(id)
);

`;

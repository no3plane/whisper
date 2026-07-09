# AI Reading Copilot Design

Date: 2026-07-09

## Goal

Build an independent desktop reading application for quickly reading classic books with AI assistance.

The product is not a book-to-summary generator. The original book remains the primary reading object. AI acts as a copilot that the reader calls when they hit friction: a difficult passage, unclear concept, missing background, or uncertainty about how a passage fits the whole book.

The first version optimizes for speed with depth: help the reader move through many books faster while still understanding each book's core problem and argument.

## MVP Scope

The first version supports:

- Desktop app built with Electron.
- React/Vite/TypeScript renderer.
- Electron IPC between renderer and main process.
- Local file-based book library.
- SQLite for metadata, settings, problem maps, and reading threads.
- Importing `md` and `epub` books.
- Converting imported books into a unified internal book model.
- Generating a whole-book problem map after import.
- Reading the original text in a dedicated reader view.
- Selecting text and calling one of five reading actions:
  - Plain explanation.
  - Structural positioning.
  - Concept explanation.
  - Background completion.
  - Example or analogy.
- Showing AI responses in independent right-panel tabs.
- Allowing follow-up questions inside each AI result tab.
- Letting the user switch context strategies:
  - `full_book`
  - `compressed_book`
  - `hybrid`
- OpenAI-compatible model configuration via user-entered `baseURL`, `apiKey`, `model`, and `contextWindow`.

The first version does not include:

- PDF/OCR parsing.
- Automatic quizzes.
- Reading progress gamification.
- Heavy note-taking workflows.
- Multi-provider native integrations beyond OpenAI-compatible APIs.
- A full plugin marketplace for reading techniques.

PDFs can be handled by the user's existing external conversion workflow and then imported as markdown.

## Product Shape

The app has four main areas:

- Library view.
- Reader view.
- Right AI panel.
- Settings view.

In the library view, the user imports a markdown or EPUB book. The app copies the original file into its own library directory, parses it, creates a normalized `BookDocument`, estimates token length, and starts whole-book preprocessing.

During preprocessing, the app tries to let the model see the full book and generate a problem map. The problem map is a high-level understanding layer, not a replacement for reading. It answers:

- What core problem forced this book into existence?
- What answer does the author give?
- What argument spine supports that answer?
- Which concepts matter most?
- How do chapters serve the core problem?
- Which claims have important original-text anchors?

In the reader view, the center pane is always the book text. The user selects text and opens a small action menu. Each action creates a new right-panel tab. The tab streams the answer, stores it, and supports follow-up questions.

The right panel has a permanent problem-map tab and dynamic reading-thread tabs. The user can switch between them while keeping their place in the book.

## Architecture

The app uses Electron as the desktop shell and local runtime.

```text
Electron App
├─ Renderer
│  └─ React / Vite / TypeScript UI
├─ Preload
│  └─ Safe window.whisper API
├─ Main Process
│  ├─ LibraryService
│  ├─ BookParser
│  ├─ PreprocessService
│  ├─ ContextAssembler
│  ├─ AIProvider
│  ├─ ReadingActionService
│  ├─ ThreadStore
│  ├─ HistoryService
│  └─ SettingsService
└─ Storage
   ├─ SQLite database
   └─ Local book library files
```

The renderer cannot access Node APIs, the filesystem, or API keys directly. It calls typed APIs exposed through preload, and preload delegates to main-process IPC handlers.

Example IPC surface:

- `books.import`
- `books.list`
- `books.open`
- `preprocess.start`
- `preprocess.status`
- `ai.runReadingAction`
- `ai.followUp`
- `threads.listByBook`
- `threads.get`
- `threads.close`
- `settings.get`
- `settings.save`
- `settings.testConnection`

## Main Services

### LibraryService

Manages the application book library.

Responsibilities:

- Copy imported `md` and `epub` files into the app library directory.
- Create `Book` records.
- Track import status and preprocessing status.
- Return book lists and recently opened books.

### BookParser

Converts supported file formats into one internal structure.

For markdown:

- Parse headings into chapters.
- Split text into stable passages.
- Preserve source order.
- Create chapter and passage anchors.

For EPUB:

- Unpack the EPUB.
- Read manifest, spine, and navigation/toc.
- Extract chapter HTML in reading order.
- Convert chapter HTML into cleaned reading content and plain text.
- Preserve basic structures such as headings, paragraphs, blockquotes, lists, footnotes where practical.

The MVP does not aim to perfectly reproduce publisher styling. It aims to preserve readable text structure and stable anchors.

### PreprocessService

Runs after import.

Responsibilities:

- Estimate full-book token count.
- Compare against configured `contextWindow`.
- Generate a `ProblemMap`.
- Generate chapter summaries and concept anchors when needed.
- Mark whether preprocessing used full-book context or a degraded strategy.

### ContextAssembler

Builds the exact model input for preprocessing, reading actions, and follow-up questions.

This is a core product component and should remain under our control rather than being hidden inside a generic agent framework.

Responsibilities:

- Apply the selected `ContextStrategy`.
- Include full book text when the strategy and model window allow.
- Include compressed whole-book representation when needed.
- Include selected text, nearby passages, current chapter metadata, problem map, and action prompt.
- Include only the current thread's message history for follow-up questions.
- Prevent one tab's history from leaking into another tab.
- Detect token overflow and return a clear downgrade or error.

### AIProvider

The first provider is OpenAI-compatible.

Settings:

- `baseURL`
- `apiKey`
- `model`
- `contextWindow`
- default context strategy

The implementation should use a stable model-call abstraction rather than raw ad hoc HTTP calls. Vercel AI SDK is the preferred first candidate because it gives a unified model interface, streaming, message formats, and provider abstractions while still letting our own `ContextAssembler` control the prompt.

Native Anthropic, Gemini, or other provider adapters can be added later.

### ReadingActionService

Runs the five first-version reading actions.

Actions:

- Plain explanation: explain the selected passage in direct language.
- Structural positioning: explain how the passage serves the book's core problem, thesis, or argument spine.
- Concept explanation: identify and explain key concepts in the passage.
- Background completion: fill in needed historical, biographical, school-of-thought, or terminology context.
- Example or analogy: give examples or analogies, including programmer-friendly analogies when useful.

Each action uses the same context machinery but a different prompt template and output contract.

### ThreadStore

Each AI result tab is a reading thread.

Responsibilities:

- Create a new thread when the user triggers a reading action from selected text.
- Store the initial selected text, action type, source passage, context strategy, and answer.
- Store follow-up messages inside the same thread.
- Keep threads isolated.
- Restore closed or previous threads for a book.

### SettingsService

Stores local model settings and app preferences.

For MVP, API keys may be stored in local app configuration or SQLite. A later version should support OS keychain storage.

## Data Model

### Book

Represents an imported book.

Fields:

- `id`
- `title`
- `author`
- `format`
- `originalFilePath`
- `libraryFilePath`
- `createdAt`
- `updatedAt`
- `lastOpenedAt`
- `preprocessStatus`
- `tokenEstimate`
- `defaultContextStrategy`

### BookDocument

Normalized parsed representation.

Fields:

- `bookId`
- `chapters`
- `passages`
- `fullText`
- `sourceMap`

### Chapter

Fields:

- `id`
- `bookId`
- `parentChapterId`
- `title`
- `level`
- `order`
- `startPassageId`
- `endPassageId`
- `summary`

### Passage

Smallest stable reading unit.

Fields:

- `id`
- `bookId`
- `chapterId`
- `order`
- `text`
- `sourceHref`
- `sourceOffset`

### ProblemMap

Fields:

- `bookId`
- `coreProblem`
- `authorAnswer`
- `argumentSpine`
- `keyConcepts`
- `chapterRoles`
- `anchors`
- `generationStrategy`
- `confidenceNotes`
- `createdAt`

Important claims and disputed points should include anchors back to chapter or passage locations.

### ReadingThread

Represents one right-panel AI tab.

Fields:

- `id`
- `bookId`
- `chapterId`
- `passageId`
- `title`
- `actionType`
- `selectedText`
- `contextStrategy`
- `createdAt`
- `updatedAt`
- `status`

### ThreadMessage

Fields:

- `id`
- `threadId`
- `role`
- `content`
- `createdAt`
- `model`
- `tokenUsage`
- `contextStrategy`

## Context Strategy

The central quality principle is: keep the whole book present whenever possible.

### full_book

Every reading action request includes:

- Full book text.
- Problem map.
- Selected text.
- Nearby passages.
- Current chapter information.
- Action prompt.
- Current thread history for follow-up questions.

This gives the best "same teacher has read the whole book" behavior. It should be the default when the full book fits inside the configured model context window.

The app should structure the prompt so the full book and problem map form a stable prefix. Providers may cache this prefix, but the app must not depend on cache support being present or consistent.

If the full book does not fit, this strategy is unavailable unless the user explicitly overrides and accepts failure risk.

### compressed_book

Every reading action request includes:

- Problem map.
- Argument spine.
- Chapter summaries.
- Key concepts.
- Important anchors.
- Selected text.
- Nearby passages.
- Current thread history for follow-up questions.

This is cheaper and faster but less faithful to original details.

### hybrid

Every reading action request includes:

- Compressed whole-book representation.
- Current chapter or a large local reading window.
- Related passages or chapters selected by anchors/search.
- Selected text.
- Current thread history for follow-up questions.

This is the default fallback when `full_book` is impossible. It can also be used when the user wants lower cost or faster responses.

## Thread And Follow-Up Behavior

Each new reading action creates an independent tab and thread.

Example:

```text
Tab 1: Plain explanation for passage A
Tab 2: Structural positioning for passage B
Tab 3: Background completion for passage C
```

The user can switch among tabs. Each tab preserves its own messages.

Follow-up questions happen inside the current tab. Follow-up context includes:

- The selected tab's original selected text.
- The tab's previous messages.
- The current question.
- The current context strategy's book background.

Follow-ups in Tab 1 never pollute Tab 2. New reading actions do not automatically include other tabs' histories.

## UI Details

### Library View

Displays:

- Book title and author.
- Format.
- Preprocessing status.
- Token estimate.
- Context strategy.
- Last opened time.

Actions:

- Import `md`.
- Import `epub`.
- Open book.
- Retry preprocessing.
- Change default context strategy for a book.

### Reader View

Layout:

- Optional left chapter navigation.
- Center reading surface.
- Right AI panel.

The reading surface should be calm and text-first. AI should not interrupt automatically.

### Selection Menu

Appears after selecting text in the reader.

Commands:

- Explain.
- Locate.
- Concepts.
- Background.
- Example.

Each command creates a right-panel tab and starts streaming an answer.

### Right AI Panel

Contains:

- Permanent problem map tab.
- Dynamic reading-thread tabs.
- Follow-up input inside each thread tab.
- Context strategy indicator on each answer.
- Error and retry states.

### Settings View

Includes:

- Provider base URL.
- API key.
- Model name.
- Context window.
- Default context strategy.
- Test connection button.

## Error Handling

Import errors:

- Keep the original file.
- Show parser failure reason.
- Allow retry.

Preprocessing errors:

- Show model or context-window failure.
- Allow retry.
- Allow switching context strategy.

Context overflow:

- If `full_book` overflows, suggest `hybrid`.
- If `hybrid` overflows, reduce local context or related passages.
- If still too large, return a clear error instead of silently dropping important context.

AI errors:

- Show failed tab state.
- Preserve selected text and prompt.
- Allow retry.

EPUB parse errors:

- Report missing spine/toc/manifest or unreadable chapter files.
- Avoid losing the imported file.

## Testing Plan

### Unit Tests

`BookParser`:

- Parses markdown headings into chapters.
- Splits markdown into stable passages.
- Parses EPUB manifest/spine/toc.
- Converts EPUB chapter HTML into readable content and plain text.

`ContextAssembler`:

- `full_book` includes full book text.
- `compressed_book` includes problem map, summaries, concepts, and selected passage.
- `hybrid` includes compressed book representation and local chapter context.
- Follow-up includes only the current thread history.
- Token overflow produces a downgrade or explicit error.

`ThreadStore`:

- New reading action creates a new thread.
- Follow-up appends to the current thread.
- Threads remain isolated.
- Threads can be restored for a book.

`AIProvider`:

- Loads OpenAI-compatible settings.
- Tests connection.
- Streams text.
- Surfaces provider errors.

### Integration Tests

- Import a markdown book.
- Generate a problem map.
- Open the reader.
- Select text.
- Run plain explanation.
- Follow up in the generated tab.
- Switch to the problem map tab.
- Switch back to the reading thread and confirm history is preserved.

### Security Tests

- Renderer cannot read API key directly.
- Renderer cannot access arbitrary filesystem APIs.
- All privileged operations go through preload and IPC.

## Open Decisions For Later

- Whether to use OS keychain storage for API keys.
- Whether to add native Anthropic/Gemini providers.
- Whether reading actions become user-editable prompt templates.
- Whether to add a plugin system for cognitive psychology reading techniques.
- Whether to add retrieval embeddings for `hybrid` related-passage selection.
- Whether to package with Electron Builder or Forge.

## Implementation Recommendation

Start with a thin vertical slice:

1. Electron + React/Vite/TypeScript shell.
2. SQLite and local library directory.
3. Settings screen with OpenAI-compatible provider test.
4. Markdown import and parsing.
5. Reader view with selectable text.
6. Right-panel tabs and thread store.
7. One reading action using `full_book`.
8. Add problem-map preprocessing.
9. Add EPUB import.
10. Add the remaining reading actions and context strategies.

This sequence validates the core reading loop early while preserving the long-term architecture.

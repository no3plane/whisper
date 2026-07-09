export const ipcChannels = {
  settingsGet: 'settings.get',
  settingsSave: 'settings.save',
  settingsTestConnection: 'settings.testConnection',
  booksImportMarkdown: 'books.importMarkdown',
  booksList: 'books.list',
  booksOpen: 'books.open',
  aiRunReadingAction: 'ai.runReadingAction',
  aiFollowUp: 'ai.followUp',
  aiStream: 'ai.stream',
  threadsListByBook: 'threads.listByBook',
  threadsListWithMessagesByBook: 'threads.listWithMessagesByBook',
  booksSetActiveThread: 'books.setActiveThread',
} as const;

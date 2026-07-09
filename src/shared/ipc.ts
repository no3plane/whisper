export const ipcChannels = {
  settingsGet: 'settings.get',
  settingsSave: 'settings.save',
  settingsTestConnection: 'settings.testConnection',
  booksImportMarkdown: 'books.importMarkdown',
  booksList: 'books.list',
  booksOpen: 'books.open',
  aiRunReadingAction: 'ai.runReadingAction',
  aiFollowUp: 'ai.followUp',
  threadsListByBook: 'threads.listByBook',
} as const;

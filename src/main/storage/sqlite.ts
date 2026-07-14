import { DatabaseSync } from 'node:sqlite';

export type AppDatabase = DatabaseSync & {
  transaction<T>(operation: () => T): () => T;
};

export function openDatabase(dbPath: string): AppDatabase {
  const db = new DatabaseSync(dbPath) as AppDatabase;
  db.transaction =
    <T>(operation: () => T) =>
    () => {
      db.exec('BEGIN');
      try {
        const result = operation();
        db.exec('COMMIT');
        return result;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    };
  return db;
}

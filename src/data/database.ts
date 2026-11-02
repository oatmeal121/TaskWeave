import Database from "@tauri-apps/plugin-sql";

const DATABASE_URL = "sqlite:taskweave.db";

let databasePromise: Promise<Database> | null = null;

export function getDatabase(): Promise<Database> {
  if (!databasePromise) {
    databasePromise = Database.load(DATABASE_URL);
  }

  return databasePromise;
}

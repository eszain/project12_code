
import type { PersistedStoreState } from "./store";

export interface PersistedDashboardState {
  store: PersistedStoreState;
  archiveOverrides: Record<number, boolean>;
}

/**
 * Storage interface.
 *
 * A PostgreSQL adapter can implement this same interface
 * in the future without changing the dashboard's logic.
 */
export interface EventPersistence {
  load(): Promise<PersistedDashboardState | null>;
  save(state: PersistedDashboardState): Promise<void>;
  clear(): Promise<void>;
}

const DATABASE_NAME = "cads-dashboard";
const DATABASE_VERSION = 1;
const OBJECT_STORE = "sessions";
const SESSION_KEY = "current";

/**
 * Open the browser's IndexedDB database.
 */
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available"));
      return;
    }

    const request = indexedDB.open(
      DATABASE_NAME,
      DATABASE_VERSION
    );

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(OBJECT_STORE)) {
        database.createObjectStore(OBJECT_STORE);
      }
    };

    request.onsuccess = () => resolve(request.result);

    request.onerror = () =>
      reject(
        request.error ??
        new Error("Failed to open IndexedDB")
      );
  });
}

/**
 * IndexedDB implementation of the persistence interface.
 */
export class IndexedDbEventPersistence
  implements EventPersistence {

  async load(): Promise<PersistedDashboardState | null> {
    const database = await openDatabase();

    try {
      return await new Promise((resolve, reject) => {
        const transaction = database.transaction(
          OBJECT_STORE,
          "readonly"
        );

        const request = transaction
          .objectStore(OBJECT_STORE)
          .get(SESSION_KEY);

        request.onsuccess = () => {
          resolve(
            (request.result as PersistedDashboardState | undefined)
              ?? null
          );
        };

        request.onerror = () =>
          reject(
            request.error ??
            new Error("Failed to load events")
          );
      });
    } finally {
      database.close();
    }
  }

  async save(state: PersistedDashboardState): Promise<void> {
    const database = await openDatabase();

    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(
          OBJECT_STORE,
          "readwrite"
        );

        transaction.objectStore(OBJECT_STORE).put(
          state,
          SESSION_KEY
        );

        transaction.oncomplete = () => resolve();

        transaction.onerror = () =>
          reject(
            transaction.error ??
            new Error("Failed to save events")
          );

        transaction.onabort = () =>
          reject(
            transaction.error ??
            new Error("Event save was aborted")
          );
      });
    } finally {
      database.close();
    }
  }

  async clear(): Promise<void> {
    const database = await openDatabase();

    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(
          OBJECT_STORE,
          "readwrite"
        );

        transaction.objectStore(OBJECT_STORE)
          .delete(SESSION_KEY);

        transaction.oncomplete = () => resolve();

        transaction.onerror = () =>
          reject(
            transaction.error ??
            new Error("Failed to clear saved events")
          );

        transaction.onabort = () =>
          reject(
            transaction.error ??
            new Error("Event reset was aborted")
          );
      });
    } finally {
      database.close();
    }
  }
}

'use client';

import type { CompactTimeline } from '@/lib/history/timeline';

/**
 * 変換済みの行動履歴をブラウザに保存しておくための入れ物。
 *
 * 位置情報は持ち主だけのものなので、サーバーには一切送らない。読み込んだファイルは
 * その場で変換して、この IndexedDB に置くだけ。次に開いたときはここから読む。
 */

const DB_NAME = 'behavior-history';
const DB_VERSION = 1;
const STORE = 'timeline';
const KEY = 'current';

export interface StoredTimeline {
  compact: CompactTimeline;
  /** 取り込んだファイル名と時刻。UI に「いつの取り込みか」を出すため。 */
  sourceName: string;
  importedAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        t.oncomplete = () => db.close();
      }),
  );
}

export async function loadStored(): Promise<StoredTimeline | null> {
  if (typeof indexedDB === 'undefined') return null;
  try {
    return (await tx<StoredTimeline | undefined>('readonly', (s) => s.get(KEY))) ?? null;
  } catch {
    // プライベートウィンドウなどで IndexedDB が使えないことがある。保存できなくても表示はできる。
    return null;
  }
}

export async function saveStored(value: StoredTimeline): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    await tx('readwrite', (s) => s.put(value, KEY));
  } catch {
    /* 保存に失敗しても、いま見ている内容には影響しない。 */
  }
}

export async function clearStored(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    await tx('readwrite', (s) => s.delete(KEY));
  } catch {
    /* 消せなくても致命的ではない。 */
  }
}

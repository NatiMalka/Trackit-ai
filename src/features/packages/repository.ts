import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../../lib/firebase';
import type { TrackedPackage } from '../tracking/types';

/**
 * Storage seam for packages.
 *
 * Firestore is the real implementation. The local one exists so `npm run dev`
 * works before any Firebase project exists, and so the app degrades to
 * device-only storage instead of a blank screen if auth fails.
 */
export interface PackagesRepository {
  readonly kind: 'firestore' | 'local';
  subscribe(onChange: (packages: TrackedPackage[]) => void, onError: (e: Error) => void): Unsubscribe;
  save(pkg: TrackedPackage): Promise<void>;
  patch(id: string, changes: Partial<TrackedPackage>): Promise<void>;
  remove(id: string): Promise<void>;
}

function sortPackages(list: TrackedPackage[]) {
  // Newest activity first, falling back to creation time for packages that have
  // never been scanned.
  return [...list].sort((a, b) => {
    const at = Date.parse(a.lastEventAt ?? a.createdAt);
    const bt = Date.parse(b.lastEventAt ?? b.createdAt);
    return bt - at;
  });
}

// --- Firestore -------------------------------------------------------------

export function firestoreRepository(uid: string): PackagesRepository {
  const col = collection(db(), 'users', uid, 'packages');

  return {
    kind: 'firestore',

    subscribe(onChange, onError) {
      return onSnapshot(
        query(col, orderBy('createdAt', 'desc')),
        (snap) => {
          const list = snap.docs.map((d) => ({ ...(d.data() as TrackedPackage), id: d.id }));
          onChange(sortPackages(list));
        },
        (err) => onError(err as Error),
      );
    },

    async save(pkg) {
      const { id, ...rest } = pkg;
      await setDoc(doc(col, id), stripUndefinedDeep(rest) as Record<string, unknown>, { merge: true });
    },

    async patch(id, changes) {
      await updateDoc(doc(col, id), stripUndefinedDeep(changes) as Record<string, unknown>);
    },

    async remove(id) {
      await deleteDoc(doc(col, id));
    },
  };
}

/** Firestore rejects `undefined`, including nested inside event arrays. */
export function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedDeep(item)) as T;
  }
  if (value && typeof value === 'object') {
    const proto = Object.getPrototypeOf(value);
    if (proto === Object.prototype || proto === null) {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) {
        if (v === undefined) continue;
        out[k] = stripUndefinedDeep(v);
      }
      return out as T;
    }
  }
  return value;
}

// --- Local -----------------------------------------------------------------

const LOCAL_KEY = 'trackit.packages';

export function localRepository(): PackagesRepository {
  const listeners = new Set<(packages: TrackedPackage[]) => void>();

  const read = (): TrackedPackage[] => {
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      return raw ? (JSON.parse(raw) as TrackedPackage[]) : [];
    } catch {
      return [];
    }
  };

  const write = (list: TrackedPackage[]) => {
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(list));
    } catch {
      /* quota or private mode: keep the in-memory view working */
    }
    const sorted = sortPackages(list);
    listeners.forEach((fn) => fn(sorted));
  };

  return {
    kind: 'local',

    subscribe(onChange) {
      listeners.add(onChange);
      onChange(sortPackages(read()));
      // Keeps two tabs of the same device in step.
      const onStorage = (e: StorageEvent) => {
        if (e.key === LOCAL_KEY) onChange(sortPackages(read()));
      };
      window.addEventListener('storage', onStorage);
      return () => {
        listeners.delete(onChange);
        window.removeEventListener('storage', onStorage);
      };
    },

    async save(pkg) {
      const list = read();
      const idx = list.findIndex((p) => p.id === pkg.id);
      if (idx >= 0) list[idx] = { ...list[idx], ...pkg };
      else list.push(pkg);
      write(list);
    },

    async patch(id, changes) {
      const list = read();
      const idx = list.findIndex((p) => p.id === id);
      if (idx < 0) return;
      list[idx] = { ...list[idx], ...changes };
      write(list);
    },

    async remove(id) {
      write(read().filter((p) => p.id !== id));
    },
  };
}

export function repositoryFor(uid: string | null): PackagesRepository {
  return uid && isFirebaseConfigured ? firestoreRepository(uid) : localRepository();
}

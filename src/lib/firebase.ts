import { initializeApp, type FirebaseApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider, type AppCheck } from 'firebase/app-check';
import { getAuth, signInAnonymously, onAuthStateChanged, type Auth, type User } from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentSingleTabManager,
  type Firestore,
} from 'firebase/firestore';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

/**
 * Without a project id there is nothing to talk to, so the app falls back to a
 * local-only demo mode rather than crashing on a wall of Firebase errors.
 * This is what makes `npm run dev` work before any Firebase setup exists.
 */
export const isFirebaseConfigured = Boolean(config.apiKey && config.projectId);

let app: FirebaseApp | undefined;
let authInstance: Auth | undefined;
let dbInstance: Firestore | undefined;
let appCheckInstance: AppCheck | undefined;

function ensureApp(): FirebaseApp {
  if (!isFirebaseConfigured) throw new Error('Firebase is not configured');
  if (!app) {
    app = initializeApp(config);

    // App Check must be installed before any other service issues a request.
    // Enforcement becomes mandatory for Firebase AI Logic on 2026-11-02.
    const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;
    const debugToken = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN;
    if (debugToken) {
      // Consumed by the App Check SDK at init; only ever set in .env.local.
      (globalThis as Record<string, unknown>).FIREBASE_APPCHECK_DEBUG_TOKEN =
        debugToken === 'true' ? true : debugToken;
    }
    if (siteKey) {
      appCheckInstance = initializeAppCheck(app, {
        provider: new ReCaptchaEnterpriseProvider(siteKey),
        isTokenAutoRefreshEnabled: true,
      });
    }
  }
  return app;
}

export function getFirebaseApp() {
  return ensureApp();
}

export function getAppCheckInstance() {
  ensureApp();
  return appCheckInstance;
}

export function auth(): Auth {
  if (!authInstance) authInstance = getAuth(ensureApp());
  return authInstance;
}

export function db(): Firestore {
  if (!dbInstance) {
    // Persistent cache is what lets the PWA render the package list offline.
    try {
      dbInstance = initializeFirestore(ensureApp(), {
        localCache: persistentLocalCache({ tabManager: persistentSingleTabManager(undefined) }),
      });
    } catch {
      dbInstance = getFirestore(ensureApp());
    }
  }
  return dbInstance;
}

/**
 * Signs the visitor in anonymously. No login screen ever appears, but every
 * visitor gets a stable uid, which is what Firestore rules and the Phase 3
 * scheduled refresh key off. Linking a real account later keeps the same uid.
 */
export function bootstrapAuth(onUser: (user: User | null) => void): () => void {
  if (!isFirebaseConfigured) {
    onUser(null);
    return () => {};
  }
  const a = auth();
  const unsub = onAuthStateChanged(a, (user) => {
    if (user) {
      onUser(user);
    } else {
      void signInAnonymously(a).catch((err) => {
        console.error('[trackit] anonymous sign-in failed', err);
        onUser(null);
      });
    }
  });
  return unsub;
}

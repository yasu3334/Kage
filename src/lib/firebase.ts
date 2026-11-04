import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  browserPopupRedirectResolver,
  getAuth,
  GoogleAuthProvider,
  initializeAuth,
  inMemoryPersistence,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

export function purgeStaleFirebaseBrowserPersistence() {
  if (typeof window === 'undefined') return;
  const sweepStorage = (store: Storage | undefined) => {
    if (!store) return;
    try {
      const toDelete: string[] = [];
      for (let i = 0; i < store.length; i++) {
        const key = store.key(i);
        if (key && key.startsWith('firebase:')) {
          toDelete.push(key);
        }
      }
      for (const key of toDelete) {
        store.removeItem(key);
      }
    } catch {
      // ignore storage access restrictions in sandboxed iframes
    }
  };

  try {
    sweepStorage(window.localStorage);
  } catch {
    // ignore
  }
  try {
    sweepStorage(window.sessionStorage);
  } catch {
    // ignore
  }
  try {
    window.indexedDB?.deleteDatabase?.('firebaseLocalStorageDb');
  } catch {
    // ignore
  }
}

export function isFirebaseTokenServiceDisabledError(err: unknown): boolean {
  const code = String((err as any)?.code || '').toLowerCase();
  const message = String((err as any)?.message || '').toLowerCase();
  return (
    code.includes('token-service-api-has-not-been-used') ||
    code.includes('operation-not-allowed') ||
    code.includes('configuration-not-found') ||
    message.includes('securetoken.googleapis.com') ||
    message.includes('identitytoolkit.googleapis.com') ||
    message.includes('token-service-api-has-not-been-used')
  );
}

purgeStaleFirebaseBrowserPersistence();

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = (() => {
  try {
    return initializeAuth(app, {
      persistence: inMemoryPersistence,
      popupRedirectResolver: browserPopupRedirectResolver,
    });
  } catch {
    return getAuth(app);
  }
})();

export const googleAuthProvider = new GoogleAuthProvider();
googleAuthProvider.addScope('email');
googleAuthProvider.addScope('profile');
googleAuthProvider.setCustomParameters({ prompt: 'select_account' });

export const FIREBASE_PROJECT_ID = firebaseConfig.projectId;
export const OAUTH_CLIENT_ID = firebaseConfig.oAuthClientId || '';

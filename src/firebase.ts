import {initializeApp} from 'firebase/app';
import {GoogleAuthProvider, getAuth, signInWithPopup, signOut} from 'firebase/auth';
import {
  doc,
  getDocFromServer,
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

function createFirestoreInstance(): Firestore {
  const customDbId =
    firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)'
      ? firebaseConfig.firestoreDatabaseId
      : undefined;
  try {
    return customDbId
      ? initializeFirestore(
          app,
          {
            localCache: persistentLocalCache({
              tabManager: persistentMultipleTabManager(),
            }),
          },
          customDbId,
        )
      : initializeFirestore(app, {
          localCache: persistentLocalCache({
            tabManager: persistentMultipleTabManager(),
          }),
        });
  } catch {
    return customDbId ? getFirestore(app, customDbId) : getFirestore(app);
  }
}

// CRITICAL: Pass firebaseConfig.firestoreDatabaseId for the provisioned Firestore instance
export const db = createFirestoreInstance();
export const auth = getAuth(app);

export const googleProvider = new GoogleAuthProvider();

export async function signInWithGoogle(forceAccountPicker: boolean = false) {
  const provider = new GoogleAuthProvider();
  if (forceAccountPicker) {
    provider.setCustomParameters({prompt: 'select_account'});
  }
  return signInWithPopup(auth, provider);
}

export async function signOutGoogle() {
  return signOut(auth);
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

void testConnection();

import "server-only";
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

const isFirebaseAdminConfigured = () => {
  return Boolean(
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PRIVATE_KEY
  );
};

export const getFirebaseAdminApp = () => {
  if (!isFirebaseAdminConfigured()) {
    return null;
  }
  const apps = getApps();
  if (apps.length > 0) {
    return apps[0];
  }
  const privateKey = process.env.FIREBASE_PRIVATE_KEY
    ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n")
    : undefined;

  return initializeApp({
    credential: cert({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: privateKey,
    }),
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  });
};

export const getFirestoreDb = () => {
  const app = getFirebaseAdminApp();
  if (!app) return null;
  return getFirestore(app);
};

export const getStorageBucket = () => {
  const app = getFirebaseAdminApp();
  if (!app) return null;
  return getStorage(app).bucket();
};

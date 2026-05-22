import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
// Pasar el bucket explícitamente con gs:// para evitar "No default bucket found"
const bucketUrl = `gs://${process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'respaldogp-a2578.firebasestorage.app'}`;
export const storage = getStorage(app, bucketUrl);
// Reintentos cortos: si Storage no responde (p.ej. no está activado en la
// consola de Firebase), la subida falla rápido con un error claro en vez
// de quedarse "girando" durante minutos.
storage.maxUploadRetryTime = 20000;
storage.maxOperationRetryTime = 20000;

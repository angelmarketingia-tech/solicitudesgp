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
// Tiempos de reintento.
// OJO: `maxUploadRetryTime` acota CADA petición de subida. Con 20 s, un
// archivo de un par de MB en una conexión normal-lenta ya no alcanzaba a
// terminar y fallaba con `storage/retry-limit-exceeded`. Se sube a 2 min
// (las subidas usan `uploadBytesResumable`, que va por trozos, y además
// tienen su propio watchdog de "sin avance" en `storage-upload.ts`).
storage.maxUploadRetryTime = 120000;
// Operaciones sueltas (getDownloadURL, listAll, delete): siguen siendo
// cortas para detectar rápido un bucket inactivo.
storage.maxOperationRetryTime = 30000;

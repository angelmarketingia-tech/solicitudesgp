import { initializeApp } from "firebase/app";
import { initializeFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);

/**
 * Firestore habla por WebChannel (streaming). En algunas redes móviles y
 * proveedores lo bloquean o lo dejan a medias: la conexión no falla, se queda
 * colgada, y la app se queda cargando para siempre sin error. Nos pasó con una
 * influencer en El Salvador mientras aquí abría sin problema.
 *
 * `experimentalAutoDetectLongPolling` detecta esas redes y cambia solo a
 * peticiones normales (long polling), que atraviesan cualquier proxy.
 */
export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
});
// Firebase Authentication: se usa SOLO para que cada persona tenga su propia
// contraseña (crearla, cambiarla y recuperarla). El rol NO sale de aquí: lo
// sigue resolviendo el servidor a partir del correo, en /api/auth.
export const auth = getAuth(app);
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

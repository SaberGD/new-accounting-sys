
import { initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { getFirestore, doc, getDocFromServer } from "firebase/firestore";
import { handleFirestoreError, OperationType } from "./services/errorHandling";

const firebaseConfig = {
  apiKey: "AIzaSyAkMpoo9ZIfIlAMDG4SyCO4Fm7mFLdJ724",
  authDomain: "crm---acounting-sg.firebaseapp.com",
  projectId: "crm---acounting-sg",
  storageBucket: "crm---acounting-sg.firebasestorage.app",
  messagingSenderId: "919641001193",
  appId: "1:919641001193:web:f0df58265a9b69ffecb478",
  measurementId: "G-L53CC05Z8C"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Test connection to Firestore
async function testConnection() {
  const path = '_connection_test_/ping';
  
  // Wait for auth to be ready before testing connection if rules require auth
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      try {
        await getDocFromServer(doc(db, '_connection_test_', 'ping'));
        console.log("Firestore connection successful.");
      } catch (error) {
        if (error instanceof Error && error.message.includes('Missing or insufficient permissions')) {
          console.error("Firestore Error: Missing or insufficient permissions. Please update your security rules in the Firebase Console.");
          // Don't throw here to avoid crashing the app on startup, just log it.
        } else if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Firestore Error: The client is offline. This usually means the Firebase configuration is incorrect.");
        } else {
          console.error("Firestore Connection Test Failed:", error);
        }
      }
    } else {
      console.log("Waiting for user authentication to test Firestore connection...");
    }
  });
}

testConnection();

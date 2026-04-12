import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyC3_3GnZIv78PEVsLGjSv_k31ai8fZjmL8",
  authDomain: "eymistaken.firebaseapp.com",
  projectId: "eymistaken",
  storageBucket: "eymistaken.firebasestorage.app",
  messagingSenderId: "677072278270",
  appId: "1:677072278270:web:6bfbd792b01eb1dc6e0baf",
  measurementId: "G-PJECZ871LP"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

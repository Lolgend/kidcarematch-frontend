
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyADmIVzCHpfkT7EoqV9xBSArs50zEetIgE",
  authDomain: "kidscare-match-sg.firebaseapp.com",
  projectId: "kidscare-match-sg",
  storageBucket: "kidscare-match-sg.firebasestorage.app",
  messagingSenderId: "95546421800",
  appId: "1:95546421800:web:f181242ef735ef5a843b1d",
  measurementId: "G-H4W2VTLCKX"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
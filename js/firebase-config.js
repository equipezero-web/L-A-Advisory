import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";

import {
  getAuth
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

import {
  getFirestore
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAGKRQoKeZpj4LBQPFYX0AqtqNUZjqkqCA",
  authDomain: "advisory-web.firebaseapp.com",
  projectId: "advisory-web",
  storageBucket: "advisory-web.firebasestorage.app",
  messagingSenderId: "28667188054",
  appId: "1:28667188054:web:eac7d4be6092b198fdfcf7"
  measurementID: "G-0M6LRHCQCD"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

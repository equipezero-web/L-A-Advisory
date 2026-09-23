import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";

import {
  getAuth
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

import {
  getFirestore
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyC1TLAnzW2ohEGKSvDCsBSCCTI2MwG_EJE",
  authDomain: "royal-advisory.firebaseapp.com",
  projectId: "royal-advisory",
  storageBucket: "royal-advisory.firebasestorage.app",
  messagingSenderId: "345964504076",
  appId: "1:345964504076:web:db70a89cc00c52c5aeba29"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

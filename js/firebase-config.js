// Shared Firebase Configuration for FoodSaver
// This config is used across all modules to ensure consistency

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

// Firebase Configuration
export const firebaseConfig = {
  apiKey: "AIzaSyDAmkXauyjvhmFl3TCsVuj83M5vEeLiG94",
  authDomain: "foodsaver-de38b.firebaseapp.com",
  projectId: "foodsaver-de38b",
  storageBucket: "foodsaver-de38b.firebasestorage.app",
  messagingSenderId: "367236262821",
  appId: "1:367236262821:web:7fff2c67cfdd650f0e164c",
  measurementId: "G-EYKMW9YD14"
};

// Initialize Firebase App (singleton pattern)
let app;
let auth;
let db;

export function getFirebaseApp() {
  if (!app) {
    app = initializeApp(firebaseConfig);
  }
  return app;
}

export function getFirebaseAuth() {
  if (!auth) {
    const firebaseApp = getFirebaseApp();
    auth = getAuth(firebaseApp);
  }
  return auth;
}

export function getFirebaseFirestore() {
  if (!db) {
    const firebaseApp = getFirebaseApp();
    db = getFirestore(firebaseApp);
  }
  return db;
}

// Backward compat alias (so old code referencing getFirebaseDatabase still works briefly)
export const getFirebaseDatabase = getFirebaseFirestore;

// Export initialized instances for convenience
export const initFirebase = () => {
  return {
    app: getFirebaseApp(),
    auth: getFirebaseAuth(),
    db: getFirebaseFirestore()
  };
};

console.log('✅ Firebase config module loaded (Firestore)');

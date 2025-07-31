// public/js/firebase-config.js

// Firebase project configuration values
// These values were taken from the inline script in your admin.html
const firebaseConfig = {
  apiKey: "AIzaSyAJEuOcNLg8dYtzhMEyhMZtidfIXNALcgU",
  authDomain: "cleveland-clean-portal.firebaseapp.com",
  projectId: "cleveland-clean-portal",
  storageBucket: "cleveland-clean-portal.firebasestorage.app",
  messagingSenderId: "938625547862",
  appId: "1:938625547862:web:3655b2b380b858702705f7",
  measurementId: "G-7KZMMKZ1XW" // This is optional for basic Firebase services but good to keep if used
};

// Initialize Firebase
// This check prevents re-initializing the app if it's already been done.
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
  console.log("Firebase initialized with config from firebase-config.js");
} else {
  firebase.app(); // if already initialized, use that one
  console.log("Firebase app already initialized. Using existing app from firebase-config.js check.");
}

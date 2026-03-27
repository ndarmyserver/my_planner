/* ═══════════════════════════════════════════════
   FIREBASE CONFIGURATION
   ═══════════════════════════════════════════════ */

const firebaseConfig = {
  apiKey:            'AIzaSyBpuX5vE2QTFL4suug9BtucSI7McX3d52w',
  authDomain:        'planner-2d13b.firebaseapp.com',
  projectId:         'planner-2d13b',
  storageBucket:     'planner-2d13b.firebasestorage.app',
  messagingSenderId: "1006530757827",
  appId:             "1:1006530757827:web:f6b57d547d8eb7d8588e76",
  measurementId:     "G-MZ5V852BZC"
};

firebase.initializeApp(firebaseConfig);

const db      = firebase.firestore();
const auth    = firebase.auth();

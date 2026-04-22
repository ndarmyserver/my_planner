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

function getFirestoreLongPollingOverride() {
  try {
    const raw = window.localStorage.getItem('planner.firestore.forceLongPolling');
    if (raw === 'true' || raw === '1') return true;
    if (raw === 'false' || raw === '0') return false;
  } catch (err) {
    // Ignore storage access issues and fall back to UA-based detection.
  }
  return null;
}

function shouldForceFirestoreLongPolling() {
  const override = getFirestoreLongPollingOverride();
  if (override !== null) return override;

  const ua = navigator.userAgent || '';
  const isSafari = /Safari\//.test(ua)
    && !/Chrome\//.test(ua)
    && !/Chromium\//.test(ua)
    && !/CriOS\//.test(ua)
    && !/Edg\//.test(ua)
    && !/FxiOS\//.test(ua);

  return isSafari;
}

function configureFirestoreTransport(firestoreDb) {
  const forceLongPolling = shouldForceFirestoreLongPolling();
  const settings = forceLongPolling
    ? {
        experimentalForceLongPolling: true,
        useFetchStreams: false
      }
    : {
        experimentalAutoDetectLongPolling: true
      };

  firestoreDb.settings(settings);

  if (forceLongPolling) {
    console.info('Firestore long-polling enabled for this browser session.');
  }
}

const db      = firebase.firestore();
configureFirestoreTransport(db);
const auth    = firebase.auth();

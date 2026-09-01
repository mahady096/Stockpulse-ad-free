// ==========================================
// 📁 firebase-config.js - সম্পূর্ণ কনফিগারেশন (FCM সহ)
//    Firebase App, Auth, Firestore, Messaging
//    Push Notification সেটআপের জন্য প্রস্তুত
//
// ✅ সিকিউরিটি ফিক্স: FCM টোকেন আর কনসোলে লগ হয় না
// ==========================================

// Firebase কনফিগারেশন অবজেক্ট (আপনার প্রজেক্টের নিজস্ব ডেটা বসান)
const firebaseConfig = {
  apiKey: "AIzaSyDdPlBysAhWdbJ8KLhwoQaf2Z5EkiYdOUg",
  authDomain: "my-share-market-495aa.firebaseapp.com",
  projectId: "my-share-market-495aa",
  storageBucket: "my-share-market-495aa.firebasestorage.app",
  messagingSenderId: "1022913056078",
  appId: "1:1022913056078:web:bcc317b13a880382d2221f",
  measurementId: "G-Z3J503NM5E"
};

// Firebase ইতিমধ্যে initialized কিনা চেক করুন
if (typeof firebase === 'undefined') {
  console.error("❌ Firebase library not loaded! Please check network connection.");
} else {
  if (!firebase.apps || firebase.apps.length === 0) {
    try {
      firebase.initializeApp(firebaseConfig);
      console.log("✅ Firebase initialized successfully");
    } catch (error) {
      console.error("❌ Firebase initialization failed:", error);
    }
  } else {
    console.log("✅ Firebase already initialized");
  }
}

// ==========================================
// 📦 গ্লোবাল ভেরিয়েবল (auth, db, messaging)
// ==========================================
let auth = null;
let db = null;
let messaging = null;

try {
  if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length > 0) {
    // 🔥 compat SDK ব্যবহার করে সার্ভিস ইনিট
    auth = firebase.auth();
    db = firebase.firestore();
    
    // 🔔 Messaging ইনিশিয়ালাইজ (শুধুমাত্র ব্রাউজারে)
    if (typeof window !== 'undefined' && firebase.messaging) {
      try {
        messaging = firebase.messaging();
        console.log("✅ Firebase Messaging initialized");
      } catch (e) {
        console.warn("⚠️ Firebase Messaging not supported in this environment:", e.message);
        messaging = null;
      }
    }
    
    console.log("✅ Firebase Auth & Firestore initialized");
  } else {
    console.warn("⚠️ Firebase not initialized. Auth & Firestore unavailable.");
  }
} catch (error) {
  console.error("❌ Error initializing Firebase services:", error);
}

// ==========================================
// 💾 Offline Persistence (IndexedDB)
// ==========================================
if (db && typeof db.enablePersistence === 'function') {
  if ('indexedDB' in window) {
    db.enablePersistence({ synchronizeTabs: true })
      .then(() => console.log('✅ Offline persistence enabled (sync tabs)'))
      .catch((err) => {
        if (err.code === 'failed-precondition') {
          console.warn('⚠️ Multiple tabs open, persistence enabled in first tab only.');
        } else if (err.code === 'unimplemented') {
          console.warn('⚠️ Browser doesn\'t support persistence.');
        } else {
          console.warn('⚠️ Persistence error:', err.message);
        }
      });
  } else {
    console.warn('⚠️ IndexedDB not supported, persistence disabled.');
  }
} else {
  console.warn('⚠️ Firestore not available, persistence skipped.');
}

// ==========================================
// 🔐 Auth State Change Listener
// ==========================================
if (auth && typeof auth.onAuthStateChanged === 'function') {
  auth.onAuthStateChanged((user) => {
    if (user) {
      console.log(`✅ User logged in: ${user.email || user.uid}`);
    } else {
      console.log('👤 User logged out');
    }
  });
} else {
  console.warn('⚠️ Auth not available, state listener skipped.');
}

// ==========================================
// 🔔 FCM Token পাওয়ার ফাংশন (Push Notification-এর জন্য)
// ==========================================
async function getFCMToken() {
  if (!messaging) {
    console.warn('⚠️ Firebase Messaging not available');
    return null;
  }
  
  try {
    // Notification permission চেক
    if (Notification.permission !== 'granted') {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        console.warn('⚠️ Notification permission not granted');
        return null;
      }
    }
    
    // FCM Token নিন
    const token = await messaging.getToken({
      vapidKey: 'BJvVefLaxMNoMclXOJ_lNNGfTiYtT0e30u2MtEd9fNYN6OqW6SrIkzy_UpK-yEM0dBmhTXnsNOgabTxYtH6MDZo'
    });
    
    if (token) {
      // 🔒 সিকিউরিটি ফিক্স: টোকেন কনসোলে লগ হয় না
      return token;
    } else {
      console.warn('⚠️ No FCM token received');
      return null;
    }
  } catch (error) {
    console.error('❌ Error getting FCM token:', error);
    return null;
  }
}

// ==========================================
// 🌐 গ্লোবালি এক্সপোজ
// ==========================================
if (typeof window !== 'undefined') {
  window.auth = auth;
  window.db = db;
  window.messaging = messaging;
  window.firebaseConfig = firebaseConfig;
  window.getFCMToken = getFCMToken;
}

// ==========================================
// 📤 এক্সপোর্ট (যদি module system ব্যবহার করা হয়)
// ==========================================
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { auth, db, messaging, firebaseConfig, getFCMToken };
}

console.log('✅ firebase-config.js loaded successfully (with Messaging support)');

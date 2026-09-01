// ==========================================
// 📦 sw.js - StockPulse PWA Service Worker v3.1
//    Firebase Cloud Messaging (FCM) Push Notification সাপোর্ট সহ
//    উন্নত ক্যাশিং, অফলাইন সাপোর্ট, ব্যাকগ্রাউন্ড সিঙ্ক
//
//    ✅ ফিক্স v3.1:
//    - urlsToCache থেকে global-fix.js ও patch.js বাদ দেওয়া হয়েছে
//      (কোনো <script> ট্যাগ থেকে লোড হয় না — dead code, অহেতুক
//      cache স্পেস নিচ্ছিল; patch.js আসলে Node.js script, ব্রাউজারে
//      চললে ক্র্যাশ করত)
//    - ক্যাশ ভার্সন বাম্প করা হয়েছে (v3.0.0 → v3.1.0) যাতে
//      সিকিউরিটি/বাগ ফিক্স করা JS ফাইলগুলো পুরনো ক্যাশ থেকে না এসে
//      নতুন করে ডাউনলোড হয় — activate ইভেন্ট পুরনো ক্যাশ মুছে দেবে
// ==========================================

// ==========================================
// 🔥 আপনার VAPID পাবলিক কী (Firebase Console থেকে)
// ==========================================
const VAPID_PUBLIC_KEY = 'BJvVefLaxMNoMclXOJ_lNNGfTiYtT0e30u2MtEd9fNYN6OqW6SrIkzy_UpK-yEM0dBmhTXnsNOgabTxYtH6MDZo';

// ==========================================
// 📦 ক্যাশ নাম
//    ✅ ফিক্স: ভার্সন বাম্প (v3.0.0 → v3.1.0) — activate ইভেন্ট এই
//    নতুন নামগুলো ছাড়া বাকি সব পুরনো ক্যাশ ডিলিট করে দেবে, ফলে
//    ইউজাররা নতুন (ফিক্সড) কোড পাবে, পুরনো ক্যাশড বাগ-যুক্ত JS না
// ==========================================
const CACHE_NAME = 'stockpulse-v4.1.0';
const STATIC_CACHE = 'static-v4.1.0';
const API_CACHE = 'api-v4.1.0';
const DYNAMIC_CACHE = 'dynamic-v4.1.0';

// ==========================================
// 📦 ক্যাশে রাখার ফাইলসমূহ
// ==========================================
const urlsToCache = [
  '/',
  '/index.html',
  '/adv-charts.html',
  '/style.css',
  '/manifest.json',
  '/favicon.ico',
  
  // কোর JS ফাইল
  '/config.js',
  '/firebase-config.js',
  '/supabase-config.js',
  '/data-service.js',
  '/cache-helper.js',
  '/core.js',
  '/indicators.js',
  
  // ড্যাশবোর্ড
  '/dash-cards.js',
  '/dash-performance.js',
  '/dash-charts.js',
  '/dash-signals.js',
  '/dash-utils.js',
  
  // ট্রেড
  '/trade-buy.js',
  '/trade-sell.js',
  '/trade-history.js',
  '/trade-analysis.js',
  '/trade-suggestion.js',
  '/trade-stock-table.js',
  
  // ফিচার
  '/scanner.js',
  '/marketwatch.js',
  '/deep-analysis.js',
  '/smart-signals.js',
  '/record-date.js',
  '/dividend.js',
  '/portfolio-manager.js',
  '/notification.js',
  
  // UI
  '/ui-helpers.js',
  '/ui-modals.js',
  '/ui-charts.js',
  '/sync-metadata.js',
  // ✅ ফিক্স: global-fix.js ও patch.js সরানো হয়েছে — কোনো <script>
  // ট্যাগে লোড হয় না, তাই এখানে থাকলে শুধু অহেতুক cache স্পেস নিত।
  // patch.js আসলে Node.js স্ক্রিপ্ট (require('fs')), ব্রাউজারে
  // এক্সিকিউট হলে সাথে সাথে ক্র্যাশ করত।

  // আইকন
  '/icons/icon-72x72.png',
  '/icons/icon-96x96.png',
  '/icons/icon-128x128.png',
  '/icons/icon-144x144.png',
  '/icons/icon-152x152.png',
  '/icons/icon-192x192.png',
  '/icons/icon-384x384.png',
  '/icons/icon-512x512.png'
];

// ==========================================
// 🔧 ইনস্টল ইভেন্ট
// ==========================================
self.addEventListener('install', event => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => {
        console.log('[SW] Caching static assets...');
        return cache.addAll(urlsToCache);
      })
      .catch(err => {
        console.error('[SW] Cache addAll failed:', err);
      })
  );
  self.skipWaiting();
});

// ==========================================
// 🔄 অ্যাক্টিভেট ইভেন্ট – পুরনো ক্যাশ পরিষ্কার
// ==========================================
self.addEventListener('activate', event => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => {
          return key !== STATIC_CACHE && 
                 key !== API_CACHE && 
                 key !== DYNAMIC_CACHE &&
                 key !== CACHE_NAME;
        }).map(key => {
          console.log('[SW] Removing old cache:', key);
          return caches.delete(key);
        })
      );
    })
  );
  return self.clients.claim();
});

// ==========================================
// 🌐 ফেচ ইভেন্ট – স্মার্ট ক্যাশিং
// ==========================================
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  const request = event.request;

  // Supabase contains user-specific application data.
  // NEVER put Supabase responses into the shared service-worker cache.
  if (url.hostname.includes('supabase')) {
    event.respondWith(fetch(request));
    return;
  }

  // Public market/API requests – network first, cache fallback.
  if (url.pathname.includes('/api/') || 
      url.hostname.includes('dse-scraper') ||
      url.hostname.includes('bd-stock-api')) {
    
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(API_CACHE).then(cache => {
              cache.put(request, clone);
            });
          }
          return response;
        })
        .catch(() => {
          return caches.match(request).then(cached => {
            if (cached) return cached;
            return new Response(JSON.stringify({ 
              error: 'Offline', 
              message: 'You are offline. Please check your connection.' 
            }), {
              status: 503,
              headers: { 'Content-Type': 'application/json' }
            });
          });
        })
    );
    return;
  }

  // স্ট্যাটিক রিসোর্স – ক্যাশ ফার্স্ট
  if (urlsToCache.some(path => url.pathname === path) ||
      url.pathname.match(/\.(css|js|png|jpg|svg|woff2?|json|ico)$/)) {
    
    event.respondWith(
      caches.match(request)
        .then(response => {
          if (response) return response;
          return fetch(request).then(fetchRes => {
            if (fetchRes && fetchRes.status === 200) {
              const clone = fetchRes.clone();
              caches.open(DYNAMIC_CACHE).then(cache => {
                cache.put(request, clone);
              });
            }
            return fetchRes;
          });
        })
        .catch(() => {
          return caches.match('/index.html');
        })
    );
    return;
  }

  // HTML পেজ – নেটওয়ার্ক ফার্স্ট, ক্যাশ ফ্যালব্যাক
  if (request.headers.get('Accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(DYNAMIC_CACHE).then(cache => {
              cache.put(request, clone);
            });
          }
          return response;
        })
        .catch(() => {
          return caches.match('/index.html');
        })
    );
    return;
  }

  // বাকি – নেটওয়ার্ক
  event.respondWith(
    fetch(request).catch(() => {
      return caches.match('/index.html');
    })
  );
});

// ==========================================
// 📡 পুশ নোটিফিকেশন ইভেন্ট (FCM)
// ==========================================
self.addEventListener('push', event => {
  if (!event.data) {
    console.log('[SW] Push received but no data');
    return;
  }

  try {
    // FCM পে-লোড JSON অথবা plain text হতে পারে
    let payload;
    try {
      payload = event.data.json();
    } catch (e) {
      payload = { title: 'StockPulse', body: event.data.text() };
    }

    // FCM থেকে notification object থাকলে সেটা ব্যবহার করি
    const notification = payload.notification || {};
    const data = payload.data || {};

    const title = notification.title || data.title || '📊 StockPulse Update';
    const body = notification.body || data.body || 'Your portfolio has been updated.';
    const icon = notification.icon || data.icon || '/icons/icon-192x192.png';
    const badge = '/icons/icon-96x96.png';
    const url = data.url || '/';

    const options = {
      body: body,
      icon: icon,
      badge: badge,
      vibrate: [200, 100, 200],
      data: {
        url: url,
        date: data.date || Date.now()
      },
      actions: [
        { action: 'open', title: '📊 Open App' },
        { action: 'dismiss', title: '✖ Dismiss' }
      ]
    };

    event.waitUntil(
      self.registration.showNotification(title, options)
    );
  } catch (error) {
    console.error('[SW] Push notification error:', error);
  }
});

// ==========================================
// 🔔 নোটিফিকেশন ক্লিক হ্যান্ডলার
// ==========================================
self.addEventListener('notificationclick', event => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const urlToOpen = event.notification.data?.url || '/';
  
  event.waitUntil(
    clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    }).then(windowClients => {
      for (const client of windowClients) {
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

// ==========================================
// 📶 নেটওয়ার্ক স্ট্যাটাস চেঞ্জ
// ==========================================
self.addEventListener('online', () => {
  console.log('[SW] Online - checking for updates...');
  self.registration.sync.register('sync-portfolio');
});

self.addEventListener('offline', () => {
  console.log('[SW] Offline - serving from cache');
});

// ==========================================
// 🔄 মেসেজ হ্যান্ডলার (UI থেকে কমান্ড)
// ==========================================
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then(keys => {
        return Promise.all(
          keys.map(key => {
            console.log('[SW] Clearing cache:', key);
            return caches.delete(key);
          })
        );
      }).then(() => {
        event.ports[0].postMessage({ success: true });
      })
    );
  }
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ==========================================
// 📡 FCM Token পেতে subscribe করুন (UI থেকে কল হবে)
//    এখানে শুধু ইভেন্ট লিসেনার নেই, টোকেন নেওয়ার লজিক UI-তে থাকবে
//    কিন্তু আমরা একটি মেসেজ হ্যান্ডলার যোগ করি যাতে UI টোকেন রিকোয়েস্ট করতে পারে
// ==========================================
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'GET_FCM_TOKEN') {
    event.waitUntil(
      (async () => {
        try {
          // Service Worker রেজিস্ট্রেশন থেকে pushManager ব্যবহার করি
          const registration = await self.registration;
          const subscription = await registration.pushManager.getSubscription();
          if (subscription) {
            event.ports[0].postMessage({ 
              success: true, 
              token: subscription.endpoint,
              subscription: subscription 
            });
          } else {
            event.ports[0].postMessage({ success: false, error: 'No active subscription' });
          }
        } catch (error) {
          event.ports[0].postMessage({ success: false, error: error.message });
        }
      })()
    );
  }
});

console.log('✅ Service Worker v3.1 (with FCM, cache fix) loaded successfully');
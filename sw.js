const CACHE_NAME = 'english-collocations-v11';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/pdf.pdf',
  '/icon-192.svg',
  '/icon-512.svg',
  // External CSS and JS resources
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  // PDF.js files (these should be local files)
  '/pdf.min.js',
  '/pdf.worker.min.js',
  // Add all audio files to cache with correct paths
  'sounds/Collocations-Lesson01.mp3',
  'sounds/Collocations-Lesson02.mp3',
  'sounds/Collocations-Lesson03.mp3',
  'sounds/Collocations-Lesson04.mp3',
  'sounds/Collocations-Lesson05.mp3',
  'sounds/Collocations-Lesson06.mp3',
  'sounds/Collocations-Lesson07.mp3',
  'sounds/Collocations-Lesson08.mp3',
  'sounds/Collocations-Lesson09.mp3',
  'sounds/Collocations-Lesson10.mp3',
  'sounds/Collocations-Lesson11.mp3',
  'sounds/Collocations-Lesson12.mp3',
  'sounds/Collocations-Lesson13.mp3',
  'sounds/Collocations-Lesson14.mp3',
  'sounds/Collocations-Lesson15.mp3',
  'sounds/Collocations-Lesson16.mp3',
  'sounds/Collocations-Lesson17.mp3',
  'sounds/Collocations-Lesson18.mp3',
  'sounds/Collocations-Lesson19.mp3',
  'sounds/Collocations-Lesson20.mp3',
  'sounds/Collocations-Lesson21.mp3',
  'sounds/Collocations-Lesson22.mp3',
  'sounds/Collocations-Lesson23.mp3',
  'sounds/Collocations-Lesson24.mp3',
  'sounds/Collocations-Lesson25.mp3',
  'sounds/Collocations-Lesson26.mp3',
  'sounds/Collocations-Lesson27.mp3',
  'sounds/Collocations-Lesson28.mp3',
  'sounds/Collocations-Lesson29.mp3',
  'sounds/Collocations-Lesson30.mp3',
  'sounds/Collocations-Lesson31.mp3',
  'sounds/Collocations-Lesson32.mp3',
  'sounds/Collocations-Lesson33.mp3',
  'sounds/Collocations-Lesson34.mp3',
  'sounds/Collocations-Lesson35.mp3',
  'sounds/Collocations-Lesson36.mp3',
  'sounds/Collocations-Lesson37.mp3',
  'sounds/Collocations-Lesson38.mp3',
  'sounds/Collocations-Lesson39.mp3',
  'sounds/Collocations-Lesson40.mp3',
  'sounds/Collocations-Lesson41.mp3',
  'sounds/Collocations-Lesson42.mp3',
  'sounds/Collocations-Lesson43.mp3',
  'sounds/Collocations-Lesson44.mp3',
  'sounds/Collocations-Lesson45.mp3',
  'sounds/Collocations-Lesson46.mp3',
  'sounds/Collocations-Lesson47.mp3',
  'sounds/Collocations-Lesson48.mp3',
  'sounds/Collocations-Lesson49.mp3',
  'sounds/Collocations-Lesson50.mp3',
  // External CDN resources
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  '/pdf.min.js',
  '/pdf.worker.min.js'
];

// Install Service Worker
self.addEventListener('install', (event) => {
  console.log('Service Worker installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Cache opened, caching critical files only...');
        
        // Cache only critical files during install (not audio files)
        const criticalFiles = [
          '/',
          '/index.html',
          '/manifest.json',
          '/pdf.pdf',
          '/icon-192.svg',
          '/icon-512.svg',
          '/pdf.min.js',
          '/pdf.worker.min.js'
        ];
        
        console.log('Caching critical files...');
        return cache.addAll(criticalFiles)
          .then(() => {
            console.log('Critical files cached successfully');
            
            // Cache external resources only
            const externalFiles = urlsToCache.filter(url => url.startsWith('https://'));
            console.log('Caching external resources...');
            
            return Promise.allSettled(
              externalFiles.map(url => {
                console.log(`Caching external: ${url}`);
                return cache.add(url).catch(err => {
                  console.warn(`Failed to cache external resource ${url}:`, err);
                  return null;
                });
              })
            );
          })
          .then(() => {
            console.log('Service Worker installation completed successfully');
            console.log('Audio files will be cached on-demand and in background');
          });
      })
      .catch((error) => {
        console.error('Cache installation failed:', error);
      })
  );
  
  // Force the waiting service worker to become the active service worker
  self.skipWaiting();
});

// Fetch event - Advanced offline strategy
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Skip requests that are not http/https (like chrome-extension, data, blob, etc.)
  if (!event.request.url.startsWith('http://') && !event.request.url.startsWith('https://')) {
    return;
  }

  // Skip browser extensions and other non-cacheable schemes
  if (event.request.url.includes('chrome-extension') || 
      event.request.url.includes('moz-extension') || 
      event.request.url.includes('ms-browser-extension')) {
    return;
  }

  // Handle different types of requests with different strategies
  if (event.request.url.includes('.mp3')) {
    // Audio files: Cache first, then network
    event.respondWith(cacheFirst(event.request));
  } else if (event.request.url.includes('.pdf') || 
             event.request.url.includes('.svg') || 
             event.request.url.includes('.jpg') || 
             event.request.url.includes('.png')) {
    // Static assets: Cache first
    event.respondWith(cacheFirst(event.request));
  } else if (event.request.url.includes('api') || 
             event.request.url.includes('data')) {
    // API calls: Network first, then cache
    event.respondWith(networkFirst(event.request));
  } else {
    // Default strategy for HTML, CSS, JS: Stale while revalidate
    event.respondWith(staleWhileRevalidate(event.request));
  }
});

// Cache First Strategy - Best for static assets
async function cacheFirst(request) {
  try {
    // Additional check for valid schemes
    if (!request.url.startsWith('http://') && !request.url.startsWith('https://')) {
      console.warn('Skipping cache for invalid scheme:', request.url);
      return fetch(request);
    }

    console.log('Cache first strategy for:', request.url);
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      console.log('Found in cache:', request.url);
      return cachedResponse;
    }
    
    console.log('Not in cache, fetching from network:', request.url);
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.status === 200) {
      console.log('Successfully fetched, adding to cache:', request.url);
      const cache = await caches.open(CACHE_NAME);
      // Clone the response before caching
      const responseClone = networkResponse.clone();
      await cache.put(request, responseClone);
    }
    return networkResponse;
  } catch (error) {
    console.error('Cache first failed for:', request.url, error);
    // Return offline fallback if available
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      console.log('Returning cached version after network failure:', request.url);
      return cachedResponse;
    }
    return getOfflineFallback(request);
  }
}

// Network First Strategy - Best for dynamic content
async function networkFirst(request) {
  try {
    // Additional check for valid schemes
    if (!request.url.startsWith('http://') && !request.url.startsWith('https://')) {
      console.warn('Skipping cache for invalid scheme:', request.url);
      return fetch(request);
    }

    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.warn('Network first failed, trying cache for:', request.url);
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    return getOfflineFallback(request);
  }
}

// Stale While Revalidate Strategy - Best for frequently updated content
async function staleWhileRevalidate(request) {
  // Additional check for valid schemes
  if (!request.url.startsWith('http://') && !request.url.startsWith('https://')) {
    console.warn('Skipping cache for invalid scheme:', request.url);
    return fetch(request);
  }

  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);
  
  // Fetch in background to update cache
  const fetchPromise = fetch(request).then(response => {
    if (response && response.status === 200) {
      cache.put(request, response.clone());
    }
    return response;
  }).catch(error => {
    console.warn('Background fetch failed for:', request.url, error);
  });
  
  // Return cached version immediately, or wait for network if no cache
  return cachedResponse || fetchPromise;
}

// Offline Fallback
async function getOfflineFallback(request) {
  // For HTML requests, return the main page
  if (request.headers.get('accept').includes('text/html')) {
    const cachedPage = await caches.match('/index.html');
    if (cachedPage) {
      return cachedPage;
    }
  }
  
  // For other requests, return a basic offline response
  return new Response('Offline - Content not available', {
    status: 503,
    statusText: 'Service Unavailable',
    headers: new Headers({
      'Content-Type': 'text/plain',
    }),
  });
}

// Activate Service Worker
self.addEventListener('activate', (event) => {
  console.log('Service Worker activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // Take control of all pages immediately
      return self.clients.claim();
    })
  );
});

// Handle messages from the main thread
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('Skipping waiting...');
    self.skipWaiting();
  } else if (event.data && event.data.type === 'CACHE_AUDIO') {
    const audioPath = event.data.audioPath;
    
    // Validate the audio path
    if (!audioPath || (!audioPath.startsWith('sounds/') && !audioPath.startsWith('/sounds/'))) {
      console.warn('Invalid audio path:', audioPath);
      return;
    }
    
    caches.open(CACHE_NAME).then(cache => {
      // Check if already cached first
      return cache.match(audioPath).then(cachedResponse => {
        if (cachedResponse) {
          console.log('Audio already cached, skipping:', audioPath);
          return;
        }
        
        // Cache the audio file only if not already cached
        console.log('Caching new audio file:', audioPath);
        return fetch(audioPath)
          .then(response => {
            if (response && response.status === 200) {
              cache.put(audioPath, response.clone());
              console.log('Successfully cached audio:', audioPath);
            } else {
              console.warn('Failed to fetch audio (bad response):', audioPath, response?.status);
            }
            return response;
          })
          .catch(err => {
            console.warn('Failed to cache audio (network error):', audioPath, err);
          });
      });
    }).catch(err => {
      console.error('Cache operation failed:', err);
    });
  }
});

// Handle background sync for offline note saving
self.addEventListener('sync', (event) => {
  if (event.tag === 'background-sync') {
    console.log('Background sync triggered');
    event.waitUntil(doBackgroundSync());
  }
});

function doBackgroundSync() {
  // Sync notes and progress when back online
  return Promise.resolve();
}

// Handle push notifications (for future use)
self.addEventListener('push', (event) => {
  if (event.data) {
    const options = {
      body: event.data.text(),
      icon: '/icon-192x192.png',
      badge: '/icon-96x96.png',
      vibrate: [100, 50, 100],
      data: {
        dateOfArrival: Date.now(),
        primaryKey: 1
      }
    };
    
    event.waitUntil(
      self.registration.showNotification('English Collocations', options)
    );
  }
});

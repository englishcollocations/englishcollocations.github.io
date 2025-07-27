const CACHE_NAME = 'english-collocations-v14';
const CRITICAL_CACHE_NAME = `${CACHE_NAME}-critical`;
const AUDIO_CACHE_NAME = `${CACHE_NAME}-audio`;

// Separate critical files from audio files for better performance
const criticalFiles = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.svg',
  '/icon-512.svg',
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

const audioFiles = [];
for (let i = 1; i <= 50; i++) {
  audioFiles.push(`sounds/Collocations-Lesson${i.toString().padStart(2, '0')}.mp3`);
}

const urlsToCache = [...criticalFiles, ...audioFiles];

// Install Service Worker with improved performance
self.addEventListener('install', (event) => {
  console.log('Service Worker installing...', CACHE_NAME);
  
  event.waitUntil(
    Promise.all([
      // Cache critical files immediately
      caches.open(CRITICAL_CACHE_NAME).then(cache => {
        console.log('Caching critical files...');
        return cache.addAll(criticalFiles)
          .then(() => console.log('Critical files cached successfully'))
          .catch(error => {
            console.error('Failed to cache critical files:', error);
            // Try caching external resources individually
            return Promise.allSettled(
              criticalFiles.filter(url => url.startsWith('https://')).map(url => {
                return cache.add(url).catch(err => {
                  console.warn(`Failed to cache ${url}:`, err);
                  return null;
                });
              })
            );
          });
      }),
      
      // Initialize audio cache (don't cache audio files during install)
      caches.open(AUDIO_CACHE_NAME).then(() => {
        console.log('Audio cache initialized, files will be cached on-demand');
      })
    ]).then(() => {
      console.log('Service Worker installation completed successfully');
    }).catch(error => {
      console.error('Service Worker installation failed:', error);
    })
  );
  
  // Force the waiting service worker to become active immediately
  self.skipWaiting();
});

// Fetch event - Optimized offline strategy
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  const url = event.request.url;
  
  // Skip requests that are not http/https
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return;
  }

  // Skip browser extensions and other non-cacheable schemes
  if (url.includes('chrome-extension') || 
      url.includes('moz-extension') || 
      url.includes('ms-browser-extension') ||
      url.includes('safari-extension')) {
    return;
  }

  // Route requests based on content type
  if (url.includes('.mp3')) {
    // Audio files: Cache first strategy with audio cache
    event.respondWith(cacheFirst(event.request, AUDIO_CACHE_NAME));
  } else if (url.includes('.svg') || 
             url.includes('.jpg') || 
             url.includes('.png') ||
             url.includes('.js') ||
             url.includes('.css')) {
    // Static assets: Cache first with critical cache
    event.respondWith(cacheFirst(event.request, CRITICAL_CACHE_NAME));
  } else if (url.includes('api') || 
             url.includes('data') ||
             url.includes('cdn.jsdelivr.net')) {
    // API calls and CDN: Network first
    event.respondWith(networkFirst(event.request, CRITICAL_CACHE_NAME));
  } else {
    // HTML and other resources: Stale while revalidate
    event.respondWith(staleWhileRevalidate(event.request, CRITICAL_CACHE_NAME));
  }
});

// Cache First Strategy - Optimized for static assets
async function cacheFirst(request, cacheName = CRITICAL_CACHE_NAME) {
  try {
    const url = request.url;
    console.log(`Cache first strategy for: ${url} using cache: ${cacheName}`);
    
    // Try exact match first
    let cachedResponse = await caches.match(request);
    
    // For audio files, try alternative matching strategies
    if (!cachedResponse && url.includes('.mp3')) {
      cachedResponse = await findAudioInCache(url);
    }
    
    if (cachedResponse) {
      console.log(`✓ Found in cache: ${url}`);
      return cachedResponse;
    }
    
    // Fetch from network and cache
    console.log(`⬇ Fetching from network: ${url}`);
    const networkResponse = await fetch(request);
    
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(cacheName);
      // Clone before caching to avoid consuming the response
      await cache.put(request, networkResponse.clone());
      console.log(`✓ Cached: ${url}`);
    }
    
    return networkResponse;
  } catch (error) {
    console.error(`Cache first failed for: ${request.url}`, error);
    
    // Try fallback cache lookup
    const fallbackResponse = await caches.match(request);
    if (fallbackResponse) {
      console.log(`✓ Fallback cache hit: ${request.url}`);
      return fallbackResponse;
    }
    
    return getOfflineFallback(request);
  }
}

// Helper function to find audio files in cache with flexible matching
async function findAudioInCache(url) {
  try {
    // Try without query parameters
    const urlWithoutQuery = url.split('?')[0];
    let cachedResponse = await caches.match(urlWithoutQuery);
    
    if (cachedResponse) {
      console.log(`✓ Found audio by URL without query: ${urlWithoutQuery}`);
      return cachedResponse;
    }
    
    // Try filename matching across both caches
    const filename = urlWithoutQuery.split('/').pop();
    const cacheNames = [AUDIO_CACHE_NAME, CRITICAL_CACHE_NAME];
    
    for (const cacheName of cacheNames) {
      const cache = await caches.open(cacheName);
      const cacheKeys = await cache.keys();
      
      for (const key of cacheKeys) {
        if (key.url.includes(filename)) {
          console.log(`✓ Found audio by filename in ${cacheName}: ${key.url}`);
          return await cache.match(key);
        }
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error finding audio in cache:', error);
    return null;
  }
}

// Network First Strategy - Optimized for dynamic content
async function networkFirst(request, cacheName = CRITICAL_CACHE_NAME) {
  try {
    console.log(`⬇ Network first strategy for: ${request.url}`);
    
    const networkResponse = await fetch(request);
    
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(cacheName);
      // Cache the response for future offline use
      await cache.put(request, networkResponse.clone());
      console.log(`✓ Network success and cached: ${request.url}`);
      return networkResponse;
    }
    
    // If network response is not successful, try cache
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      console.log(`✓ Network failed, using cache: ${request.url}`);
      return cachedResponse;
    }
    
    return networkResponse; // Return even if not 200
  } catch (error) {
    console.warn(`Network first failed for: ${request.url}`, error);
    
    // Fallback to cache
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      console.log(`✓ Network error, fallback to cache: ${request.url}`);
      return cachedResponse;
    }
    
    return getOfflineFallback(request);
  }
}

// Stale While Revalidate Strategy - Optimized for frequently updated content
async function staleWhileRevalidate(request, cacheName = CRITICAL_CACHE_NAME) {
  console.log(`⟲ Stale while revalidate for: ${request.url}`);
  
  const cachedResponse = await caches.match(request);
  
  // Background update (don't await)
  const fetchPromise = fetch(request)
    .then(networkResponse => {
      if (networkResponse && networkResponse.status === 200) {
        const cache = caches.open(cacheName);
        cache.then(c => c.put(request, networkResponse.clone()));
        console.log(`✓ Background update cached: ${request.url}`);
      }
      return networkResponse;
    })
    .catch(error => {
      console.warn(`Background update failed for: ${request.url}`, error);
      return null;
    });
  
  // Return cached version immediately if available
  if (cachedResponse) {
    console.log(`✓ Serving from cache (updating in background): ${request.url}`);
    return cachedResponse;
  }
  
  // If no cache, wait for network
  try {
    console.log(`⬇ No cache, waiting for network: ${request.url}`);
    const networkResponse = await fetchPromise;
    return networkResponse || getOfflineFallback(request);
  } catch (error) {
    console.error(`Stale while revalidate failed for: ${request.url}`, error);
    return getOfflineFallback(request);
  }
}

// Offline Fallback - Enhanced error handling
async function getOfflineFallback(request) {
  console.log(`🔄 Providing offline fallback for: ${request.url}`);
  
  const acceptHeader = request.headers.get('accept') || '';
  
  // For HTML requests, return the main page
  if (acceptHeader.includes('text/html')) {
    const cachedPage = await caches.match('/index.html') || await caches.match('/');
    if (cachedPage) {
      console.log('✓ Returning cached index.html as fallback');
      return cachedPage;
    }
  }
  
  // For audio requests, try to find any available audio file
  if (request.url.includes('.mp3')) {
    console.log('Looking for any cached audio file as fallback...');
    const audioCache = await caches.open(AUDIO_CACHE_NAME);
    const audioKeys = await audioCache.keys();
    
    if (audioKeys.length > 0) {
      console.log(`✓ Found cached audio fallback: ${audioKeys[0].url}`);
      return await audioCache.match(audioKeys[0]);
    }
  }
  
  // For other requests, return appropriate offline response
  const responseInit = {
    status: 503,
    statusText: 'Service Unavailable',
    headers: new Headers({
      'Content-Type': acceptHeader.includes('application/json') ? 'application/json' : 'text/plain',
    }),
  };
  
  const message = acceptHeader.includes('application/json') 
    ? '{"error": "Offline - Content not available"}' 
    : 'Offline - Content not available';
  
  console.log('⚠ Returning offline fallback response');
  return new Response(message, responseInit);
}

// Cache All Files Function - Optimized for background caching
async function cacheAllFiles() {
  console.log('🔄 Starting comprehensive caching...');
  
  try {
    const results = await Promise.allSettled([
      cacheAudioFiles(),
      cacheAdditionalResources()
    ]);
    
    const audioResult = results[0];
    const resourcesResult = results[1];
    
    console.log('📊 Caching results:');
    console.log(`   Audio files: ${audioResult.status}`);
    console.log(`   Additional resources: ${resourcesResult.status}`);
    
    if (audioResult.status === 'rejected') {
      console.error('Audio caching failed:', audioResult.reason);
    }
    if (resourcesResult.status === 'rejected') {
      console.error('Resources caching failed:', resourcesResult.reason);
    }
    
    console.log('✅ Comprehensive caching completed');
    return true;
  } catch (error) {
    console.error('❌ Comprehensive caching failed:', error);
    throw error;
  }
}

// Cache Audio Files - Optimized batch processing
async function cacheAudioFiles() {
  console.log('🎵 Caching audio files...');
  
  const audioCache = await caches.open(AUDIO_CACHE_NAME);
  const existingKeys = await audioCache.keys();
  const existingUrls = new Set(existingKeys.map(req => req.url));
  
  // Filter out already cached files
  const filesToCache = audioFiles.filter(url => {
    const fullUrl = new URL(url, self.location).href;
    return !existingUrls.has(fullUrl);
  });
  
  if (filesToCache.length === 0) {
    console.log('✅ All audio files already cached');
    return;
  }
  
  console.log(`📦 Caching ${filesToCache.length} new audio files...`);
  
  // Process in smaller batches to avoid overwhelming the network
  const batchSize = 5;
  const batches = [];
  
  for (let i = 0; i < filesToCache.length; i += batchSize) {
    batches.push(filesToCache.slice(i, i + batchSize));
  }
  
  let cachedCount = 0;
  let failedCount = 0;
  
  for (const batch of batches) {
    const batchResults = await Promise.allSettled(
      batch.map(async (url) => {
        try {
          const response = await fetch(url);
          if (response && response.status === 200) {
            await audioCache.put(url, response);
            console.log(`✓ Cached: ${url}`);
            cachedCount++;
          } else {
            console.warn(`⚠ Failed to cache (bad response): ${url}`);
            failedCount++;
          }
        } catch (error) {
          console.warn(`⚠ Failed to cache (network error): ${url}`, error);
          failedCount++;
        }
      })
    );
    
    // Small delay between batches to be nice to the server
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log(`🎵 Audio caching completed: ${cachedCount} cached, ${failedCount} failed`);
}

// Cache Additional Resources
async function cacheAdditionalResources() {
  console.log('📚 Caching additional resources...');
  
  const cache = await caches.open(CRITICAL_CACHE_NAME);
  const additionalResources = [
    // No additional PDF-related resources to cache
  ];
  
  const results = await Promise.allSettled(
    additionalResources.map(async (url) => {
      try {
        const existingResponse = await cache.match(url);
        if (existingResponse) {
          console.log(`✓ Already cached: ${url}`);
          return;
        }
        
        const response = await fetch(url);
        if (response && response.status === 200) {
          await cache.put(url, response);
          console.log(`✓ Cached: ${url}`);
        } else {
          console.warn(`⚠ Failed to cache: ${url}`);
        }
      } catch (error) {
        console.warn(`⚠ Failed to cache: ${url}`, error);
      }
    })
  );
  
  console.log('📚 Additional resources caching completed');
}

// Activate Service Worker with improved cache management
self.addEventListener('activate', (event) => {
  console.log('Service Worker activating...', CACHE_NAME);
  
  event.waitUntil(
    Promise.all([
      // Clean up old caches
      caches.keys().then(cacheNames => {
        const deletePromises = cacheNames
          .filter(cacheName => 
            !cacheName.startsWith(CRITICAL_CACHE_NAME.split('-v')[0]) &&
            !cacheName.startsWith(AUDIO_CACHE_NAME.split('-v')[0])
          )
          .map(cacheName => {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          });
        
        return Promise.all(deletePromises);
      }),
      
      // Take control of all clients immediately
      self.clients.claim()
    ]).then(() => {
      console.log('Service Worker activated successfully');
      
      // Notify all clients about the activation
      return self.clients.matchAll({ includeUncontrolled: true })
        .then(clients => {
          clients.forEach(client => {
            client.postMessage({
              type: 'SW_ACTIVATED',
              message: 'Service Worker activated successfully'
            });
          });
        });
    }).catch(error => {
      console.error('Service Worker activation failed:', error);
    })
  );
});

// Handle messages from the main thread
self.addEventListener('message', (event) => {
  const { data } = event;
  
  if (!data || !data.type) {
    return;
  }
  
  switch (data.type) {
    case 'SKIP_WAITING':
      console.log('⚡ Skipping waiting and taking control...');
      self.skipWaiting();
      
      // Immediately claim all clients and reload them
      self.clients.claim().then(() => {
        // Send reload message to all clients
        self.clients.matchAll().then(clients => {
          clients.forEach(client => {
            client.postMessage({ type: 'RELOAD_NOW' });
          });
        });
      });
      break;
      
    case 'CACHE_ALL_FILES':
      console.log('📦 Received cache all files request');
      cacheAllFiles()
        .then(() => {
          // Notify the client that caching is complete
          event.ports[0]?.postMessage({ success: true });
        })
        .catch(error => {
          console.error('❌ Failed to cache all files:', error);
          event.ports[0]?.postMessage({ success: false, error: error.message });
        });
      break;
      
    case 'CACHE_AUDIO':
      const audioPath = data.audioPath;
      console.log(`🎵 Received cache audio request: ${audioPath}`);
      
      // Validate the audio path
      if (!audioPath || (!audioPath.startsWith('sounds/') && !audioPath.startsWith('/sounds/'))) {
        console.warn('⚠ Invalid audio path:', audioPath);
        return;
      }
      
      cacheAudioFile(audioPath);
      break;
      
    default:
      console.log('📨 Unknown message type:', data.type);
  }
});

// Cache individual audio file
async function cacheAudioFile(audioPath) {
  try {
    const audioCache = await caches.open(AUDIO_CACHE_NAME);
    
    // Check if already cached
    const cachedResponse = await audioCache.match(audioPath);
    if (cachedResponse) {
      console.log('✓ Audio already cached:', audioPath);
      return;
    }
    
    // Cache the audio file
    console.log('⬇ Caching audio file:', audioPath);
    const response = await fetch(audioPath);
    
    if (response && response.status === 200) {
      await audioCache.put(audioPath, response);
      console.log('✅ Successfully cached audio:', audioPath);
    } else {
      console.warn('⚠ Failed to fetch audio (bad response):', audioPath, response?.status);
    }
  } catch (error) {
    console.warn('⚠ Failed to cache audio (network error):', audioPath, error);
  }
}

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

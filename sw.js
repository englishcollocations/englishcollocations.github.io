const CACHE_NAME = 'english-collocations-v17';
const CRITICAL_CACHE_NAME = `${CACHE_NAME}-critical`;
const AUDIO_CACHE_NAME = `${CACHE_NAME}-audio`;
const TEXT_CACHE_NAME = `${CACHE_NAME}-text`;
const COLLOCATION_CACHE_NAME = `${CACHE_NAME}-collocations`;


const criticalFiles = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.svg',
  '/icon-512.svg',
  // Tailwind CDN removed due to CORS restrictions
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

const audioFiles = [];
for (let i = 1; i <= 50; i++) {
  audioFiles.push(`sounds/Collocations-Lesson${i.toString().padStart(2, '0')}.mp3`);
}

const textFiles = [];
for (let i = 1; i <= 50; i++) {
  textFiles.push(`texts/${i.toString().padStart(2, '0')}.txt`);
}

const collocationFiles = [];
for (let i = 1; i <= 50; i++) {
  collocationFiles.push(`collocations/${i.toString().padStart(2, '0')}.txt`);
}

const urlsToCache = [...criticalFiles, ...audioFiles, ...textFiles, ...collocationFiles];


self.addEventListener('install', (event) => {
  
  
  event.waitUntil(
    Promise.all([
      
      caches.open(CRITICAL_CACHE_NAME).then(cache => {
        // Separate local and external files
        const localFiles = criticalFiles.filter(url => !url.startsWith('https://'));
        const externalFiles = criticalFiles.filter(url => url.startsWith('https://'));
        
        // Cache local files first
        return cache.addAll(localFiles)
          .then(() => {
            // Then try to cache external files individually
            return Promise.allSettled(
              externalFiles.map(url => {
                return cache.add(url).catch(err => {
                  console.warn(`Failed to cache external resource ${url}:`, err.message);
                  return null;
                });
              })
            );
          })
          .catch(error => {
            console.error('Failed to cache critical files:', error);
            throw error;
          });
      }),
      
      
      caches.open(AUDIO_CACHE_NAME).then(() => {
        
      }),
      
      
      caches.open(TEXT_CACHE_NAME).then(() => {
        
      }),
      
      
      caches.open(COLLOCATION_CACHE_NAME).then(() => {
        
      })
    ]).then(() => {
      
    }).catch(error => {
      console.error('Service Worker installation failed:', error);
    })
  );
  
  
  self.skipWaiting();
});


self.addEventListener('fetch', (event) => {
  
  if (event.request.method !== 'GET') {
    return;
  }

  const url = event.request.url;
  
  // Skip requests that are not http/https
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return;
  }

  // Skip extension and problematic CDN requests
  if (url.includes('chrome-extension') || 
      url.includes('moz-extension') || 
      url.includes('ms-browser-extension') ||
      url.includes('safari-extension') ||
      url.includes('cdn.tailwindcss.com')) {
    return;
  }

  
  if (url.includes('.mp3')) {
    
    event.respondWith(cacheFirst(event.request, AUDIO_CACHE_NAME));
  } else if (url.includes('.txt') && url.includes('texts/')) {
    
    event.respondWith(cacheFirst(event.request, TEXT_CACHE_NAME));
  } else if (url.includes('.txt') && url.includes('collocations/')) {
    
    event.respondWith(cacheFirst(event.request, COLLOCATION_CACHE_NAME));
  } else if (url.includes('.svg') || 
             url.includes('.jpg') || 
             url.includes('.png') ||
             url.includes('.js') ||
             url.includes('.css')) {
    
    event.respondWith(cacheFirst(event.request, CRITICAL_CACHE_NAME));
  } else if (url.includes('api') || 
             url.includes('data') ||
             url.includes('cdn.jsdelivr.net')) {
    
    event.respondWith(networkFirst(event.request, CRITICAL_CACHE_NAME));
  } else {
    
    event.respondWith(staleWhileRevalidate(event.request, CRITICAL_CACHE_NAME));
  }
});


async function cacheFirst(request, cacheName = CRITICAL_CACHE_NAME) {
  try {
    const url = request.url;
    
    
    
    let cachedResponse = await caches.match(request);
    
    
    if (!cachedResponse && url.includes('.mp3')) {
      cachedResponse = await findAudioInCache(url);
    }
    
    
    if (!cachedResponse && url.includes('.txt')) {
      if (url.includes('texts/')) {
        cachedResponse = await findTextInCache(url);
      } else if (url.includes('collocations/')) {
        cachedResponse = await findCollocationInCache(url);
      }
    }
    
    if (cachedResponse) {
      
      return cachedResponse;
    }
    
    
    
    const networkResponse = await fetch(request);
    
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(cacheName);
      // Clone response before caching to avoid "body already used" error
      const responseToCache = networkResponse.clone();
      await cache.put(request, responseToCache);
    }
    
    return networkResponse;
  } catch (error) {
    console.error(`Cache first failed for: ${request.url}`, error);
    
    
    const fallbackResponse = await caches.match(request);
    if (fallbackResponse) {
      
      return fallbackResponse;
    }
    
    return getOfflineFallback(request);
  }
}


async function findAudioInCache(url) {
  try {
    
    const urlWithoutQuery = url.split('?')[0];
    let cachedResponse = await caches.match(urlWithoutQuery);
    
    if (cachedResponse) {
      
      return cachedResponse;
    }
    
    
    const filename = urlWithoutQuery.split('/').pop();
    const cacheNames = [AUDIO_CACHE_NAME, CRITICAL_CACHE_NAME];
    
    for (const cacheName of cacheNames) {
      const cache = await caches.open(cacheName);
      const cacheKeys = await cache.keys();
      
      for (const key of cacheKeys) {
        if (key.url.includes(filename)) {
          
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


async function findCollocationInCache(url) {
  try {
    
    const urlWithoutQuery = url.split('?')[0];
    let cachedResponse = await caches.match(urlWithoutQuery);
    
    if (cachedResponse) {
      
      return cachedResponse;
    }
    
    
    const filename = urlWithoutQuery.split('/').pop();
    const cacheNames = [COLLOCATION_CACHE_NAME, CRITICAL_CACHE_NAME];
    
    for (const cacheName of cacheNames) {
      const cache = await caches.open(cacheName);
      const cacheKeys = await cache.keys();
      
      for (const key of cacheKeys) {
        if (key.url.includes(filename) && key.url.includes('collocations/')) {
          
          return await cache.match(key);
        }
      }
    }
    
    
    return null;
  } catch (error) {
    console.error('Error finding collocation in cache:', error);
    return null;
  }
}


async function findTextInCache(url) {
  try {
    
    const urlWithoutQuery = url.split('?')[0];
    let cachedResponse = await caches.match(urlWithoutQuery);
    
    if (cachedResponse) {
      
      return cachedResponse;
    }
    
    
    const filename = urlWithoutQuery.split('/').pop();
    const cacheNames = [TEXT_CACHE_NAME, CRITICAL_CACHE_NAME];
    
    for (const cacheName of cacheNames) {
      const cache = await caches.open(cacheName);
      const cacheKeys = await cache.keys();
      
      for (const key of cacheKeys) {
        if (key.url.includes(filename)) {
          
          return await cache.match(key);
        }
      }
    }
    
    
    return null;
  } catch (error) {
    console.error('Error finding text in cache:', error);
    return null;
  }
}


async function networkFirst(request, cacheName = CRITICAL_CACHE_NAME) {
  try {
    
    
    const networkResponse = await fetch(request);
    
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(cacheName);
      // Clone response before caching to avoid "body already used" error
      const responseToCache = networkResponse.clone();
      await cache.put(request, responseToCache);
      return networkResponse;
    }
    
    
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      
      return cachedResponse;
    }
    
    return networkResponse; 
  } catch (error) {
    console.warn(`Network first failed for: ${request.url}`, error);
    
    
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      
      return cachedResponse;
    }
    
    return getOfflineFallback(request);
  }
}

async function staleWhileRevalidate(request, cacheName = CRITICAL_CACHE_NAME) {
  
  
  const cachedResponse = await caches.match(request);
  
  const fetchPromise = fetch(request)
    .then(networkResponse => {
      if (networkResponse && networkResponse.status === 200) {
        const responseClone = networkResponse.clone();
        const cache = caches.open(cacheName);
        cache.then(c => c.put(request, responseClone));
        
      }
      return networkResponse;
    })
    .catch(error => {
      console.warn(`Background update failed for: ${request.url}`, error);
      return null;
    });
  
  if (cachedResponse) {
    return cachedResponse;
  }
  
  try {
    
    const networkResponse = await fetchPromise;
    return networkResponse || getOfflineFallback(request);
  } catch (error) {
    console.error(`Stale while revalidate failed for: ${request.url}`, error);
    return getOfflineFallback(request);
  }
}

async function getOfflineFallback(request) {
  
  
  const acceptHeader = request.headers.get('accept') || '';
  
  if (acceptHeader.includes('text/html')) {
    const cachedPage = await caches.match('/index.html') || await caches.match('/');
    if (cachedPage) {
      
      return cachedPage;
    }
  }
  
  if (request.url.includes('.mp3')) {
    
    const audioCache = await caches.open(AUDIO_CACHE_NAME);
    const audioKeys = await audioCache.keys();
    
    if (audioKeys.length > 0) {
      
      return await audioCache.match(audioKeys[0]);
    }
  }
  
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
  
  
  return new Response(message, responseInit);
}

async function cacheAllFiles() {
  
  
  try {
    const results = await Promise.allSettled([
      cacheAudioFiles(),
      cacheTextFiles(),
      cacheCollocationFiles(),
      cacheAdditionalResources()
    ]);
    
    const audioResult = results[0];
    const textResult = results[1];
    const collocationResult = results[2];
    const resourcesResult = results[3];

    
    if (audioResult.status === 'rejected') {
      console.error('Audio caching failed:', audioResult.reason);
    }
    if (textResult.status === 'rejected') {
      console.error('Text caching failed:', textResult.reason);
    }
    if (collocationResult.status === 'rejected') {
      console.error('Collocation caching failed:', collocationResult.reason);
    }
    if (resourcesResult.status === 'rejected') {
      console.error('Resources caching failed:', resourcesResult.reason);
    }
    
    
    return true;
  } catch (error) {
    console.error('❌ Comprehensive caching failed:', error);
    throw error;
  }
}


async function cacheAudioFiles() {
  
  
  const audioCache = await caches.open(AUDIO_CACHE_NAME);
  const existingKeys = await audioCache.keys();
  const existingUrls = new Set(existingKeys.map(req => req.url));
  
  
  const filesToCache = audioFiles.filter(url => {
    const fullUrl = new URL(url, self.location).href;
    return !existingUrls.has(fullUrl);
  });
  
  if (filesToCache.length === 0) {
    
    return;
  }
  
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
    
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  
}

async function cacheTextFiles() {
  
  
  const textCache = await caches.open(TEXT_CACHE_NAME);
  const existingKeys = await textCache.keys();
  const existingUrls = new Set(existingKeys.map(req => req.url));
  
  const filesToCache = textFiles.filter(url => {
    const fullUrl = new URL(url, self.location).href;
    return !existingUrls.has(fullUrl);
  });
  
  if (filesToCache.length === 0) {
    
    return;
  }
  

  const batchSize = 10;
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
            await textCache.put(url, response);
            
            cachedCount++;
          } else {
            console.warn(`⚠ Failed to cache text (bad response): ${url}`);
            failedCount++;
          }
        } catch (error) {
          console.warn(`⚠ Failed to cache text (network error): ${url}`, error);
          failedCount++;
        }
      })
    );
    
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  
  
}

async function cacheCollocationFiles() {
  
  
  const collocationCache = await caches.open(COLLOCATION_CACHE_NAME);
  const existingKeys = await collocationCache.keys();
  const existingUrls = new Set(existingKeys.map(req => req.url));
  
  const filesToCache = collocationFiles.filter(url => {
    const fullUrl = new URL(url, self.location).href;
    return !existingUrls.has(fullUrl);
  });
  
  if (filesToCache.length === 0) {
    
    return;
  }
  
  const batchSize = 10; 
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
            await collocationCache.put(url, response);
            
            cachedCount++;
          } else {
            console.warn(`⚠ Failed to cache collocation (bad response): ${url}`);
            failedCount++;
          }
        } catch (error) {
          console.warn(`⚠ Failed to cache collocation (network error): ${url}`, error);
          failedCount++;
        }
      })
    );
    
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  
  

}

async function cacheAdditionalResources() {
  
  
  const cache = await caches.open(CRITICAL_CACHE_NAME);
  const additionalResources = [
  ];
  
  const results = await Promise.allSettled(
    additionalResources.map(async (url) => {
      try {
        const existingResponse = await cache.match(url);
        if (existingResponse) {
          
          return;
        }
        
        const response = await fetch(url);
        if (response && response.status === 200) {
          await cache.put(url, response);
          
        } else {
          console.warn(`⚠ Failed to cache: ${url}`);
        }
      } catch (error) {
        console.warn(`⚠ Failed to cache: ${url}`, error);
      }
    })
  );
  
  
}

self.addEventListener('activate', (event) => {
  
  
  event.waitUntil(
    Promise.all([
      caches.keys().then(cacheNames => {
        const deletePromises = cacheNames
          .filter(cacheName => 
            !cacheName.startsWith(CRITICAL_CACHE_NAME.split('-v')[0]) &&
            !cacheName.startsWith(AUDIO_CACHE_NAME.split('-v')[0]) &&
            !cacheName.startsWith(TEXT_CACHE_NAME.split('-v')[0]) &&
            !cacheName.startsWith(COLLOCATION_CACHE_NAME.split('-v')[0])
          )
          .map(cacheName => {
            
            return caches.delete(cacheName);
          });
        
        return Promise.all(deletePromises);
      }),
      
      self.clients.claim()
    ]).then(() => {
      
      
      
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


self.addEventListener('message', (event) => {
  const { data } = event;
  
  if (!data || !data.type) {
    return;
  }
  
  switch (data.type) {
    case 'SKIP_WAITING':
      
      self.skipWaiting();
      
      
      self.clients.claim().then(() => {
        
        self.clients.matchAll().then(clients => {
          clients.forEach(client => {
            client.postMessage({ type: 'RELOAD_NOW' });
          });
        });
      });
      break;
      
    case 'CACHE_ALL_FILES':
      
      cacheAllFiles()
        .then(() => {
          
          event.ports[0]?.postMessage({ success: true });
        })
        .catch(error => {
          console.error('❌ Failed to cache all files:', error);
          event.ports[0]?.postMessage({ success: false, error: error.message });
        });
      break;
      
    case 'CACHE_AUDIO':
      const audioPath = data.audioPath;
      
      
      
      if (!audioPath || (!audioPath.startsWith('sounds/') && !audioPath.startsWith('/sounds/'))) {
        console.warn('⚠ Invalid audio path:', audioPath);
        return;
      }
      
      cacheAudioFile(audioPath);
      break;
      
    case 'CACHE_TEXT':
      const textPath = data.textPath;
      
      
      
      if (!textPath || (!textPath.startsWith('texts/') && !textPath.startsWith('/texts/'))) {
        console.warn('⚠ Invalid text path:', textPath);
        return;
      }
      
      cacheTextFile(textPath);
      break;
      
    case 'CACHE_COLLOCATION':
      const collocationPath = data.collocationPath;
      
      
      
      if (!collocationPath || (!collocationPath.startsWith('collocations/') && !collocationPath.startsWith('/collocations/'))) {
        console.warn('⚠ Invalid collocation path:', collocationPath);
        return;
      }
      
      cacheCollocationFile(collocationPath);
      break;
      
    default:
      
  }
});


async function cacheAudioFile(audioPath) {
  try {
    const audioCache = await caches.open(AUDIO_CACHE_NAME);
    
    
    const cachedResponse = await audioCache.match(audioPath);
    if (cachedResponse) {
      
      return;
    }
    
    
    
    const response = await fetch(audioPath);
    
    if (response && response.status === 200) {
      await audioCache.put(audioPath, response);
      
    } else {
      console.warn('⚠ Failed to fetch audio (bad response):', audioPath, response?.status);
    }
  } catch (error) {
    console.warn('⚠ Failed to cache audio (network error):', audioPath, error);
  }
}


async function cacheTextFile(textPath) {
  try {
    const textCache = await caches.open(TEXT_CACHE_NAME);
    
    
    const cachedResponse = await textCache.match(textPath);
    if (cachedResponse) {
      
      return;
    }
    
    
    
    const response = await fetch(textPath);
    
    if (response && response.status === 200) {
      await textCache.put(textPath, response);
      
    } else {
      console.warn('⚠ Failed to fetch text (bad response):', textPath, response?.status);
    }
  } catch (error) {
    console.warn('⚠ Failed to cache text (network error):', textPath, error);
  }
}


async function cacheCollocationFile(collocationPath) {
  try {
    const collocationCache = await caches.open(COLLOCATION_CACHE_NAME);
    
    
    const cachedResponse = await collocationCache.match(collocationPath);
    if (cachedResponse) {
      
      return;
    }
    
    
    
    const response = await fetch(collocationPath);
    
    if (response && response.status === 200) {
      await collocationCache.put(collocationPath, response);
      
    } else {
      console.warn('⚠ Failed to fetch collocation (bad response):', collocationPath, response?.status);
    }
  } catch (error) {
    console.warn('⚠ Failed to cache collocation (network error):', collocationPath, error);
  }
}


self.addEventListener('sync', (event) => {
  if (event.tag === 'background-sync') {
    
    event.waitUntil(doBackgroundSync());
  }
});

function doBackgroundSync() {
  
  return Promise.resolve();
}


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

const CACHE='famosos-app-v4';
const SHELL=['./','./index.html','./names.js','./app.js','./jszip.min.js','./icon.png','./manifest.webmanifest'];
self.addEventListener('install',ev=>ev.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',ev=>ev.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('famosos-app-')&&k!==CACHE).map(k=>caches.delete(k)))),self.clients.claim()])));
self.addEventListener('fetch',ev=>{if(new URL(ev.request.url).origin!==location.origin)return;ev.respondWith(caches.match(ev.request).then(a=>a||fetch(ev.request).then(r=>{if(r.ok)caches.open(CACHE).then(c=>c.put(ev.request,r.clone()));return r;})))});

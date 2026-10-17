// Service worker : l'app fonctionne hors ligne au stand.
// Stratégie « stale-while-revalidate » : réponse immédiate depuis le cache, mise à jour
// en arrière-plan (la nouvelle version s'affiche au lancement suivant).
// Incrémenter VERSION quand on ajoute ou retire des fichiers de la liste.

const VERSION = 'v5';
const APP_CACHE = `shot-timer-${VERSION}`;
const FONT_CACHE = 'shot-timer-fonts';

const FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './js/app.js',
  './js/router.js',
  './js/state.js',
  './js/settings.js',
  './js/ui.js',
  './js/share.js',
  './js/db/idb.js',
  './js/db/repo.js',
  './js/db/backup.js',
  './js/screens/shooters.js',
  './js/screens/exercises.js',
  './js/screens/prep.js',
  './js/screens/session.js',
  './js/screens/sessions.js',
  './js/screens/report.js',
  './js/report/summary.js',
  './js/export/xlsx.js',
  './js/vendor/xlsx.mini.min.js',
  './js/audio/engine.js',
  './js/audio/detector-worklet.js',
  './js/timer/run.js',
  './js/timer/stats.js',
  './js/timer/wakelock.js',
  './js/screens/home.js',
  './js/screens/ready.js',
  './js/screens/live.js',
  './js/screens/result.js',
  './js/screens/settings.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(APP_CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((k) => k.startsWith('shot-timer-') && k !== APP_CACHE && k !== FONT_CACHE)
        .map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Polices Google : cache permanent après le premier chargement en ligne.
  if (url.host === 'fonts.googleapis.com' || url.host === 'fonts.gstatic.com') {
    e.respondWith(caches.open(FONT_CACHE).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') c.put(req, res.clone());
      return res;
    }));
    return;
  }

  if (url.origin !== location.origin) return;

  e.respondWith(caches.open(APP_CACHE).then(async (c) => {
    const hit = await c.match(req, { ignoreSearch: true });
    const update = fetch(req).then((res) => {
      if (res.ok) c.put(req, res.clone());
      return res;
    }).catch(() => null);
    if (hit) { e.waitUntil(update); return hit; }
    const res = await update;
    return res || (req.mode === 'navigate' ? c.match('./index.html') : Response.error());
  }));
});

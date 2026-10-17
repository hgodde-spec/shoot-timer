// Démarrage : routes, déblocage audio au premier geste, service worker.

import { engine } from './audio/engine.js';
import { route, startRouter } from './router.js';
import { renderHome } from './screens/home.js';
import { renderReady } from './screens/ready.js';
import { renderLive } from './screens/live.js';
import { renderResult } from './screens/result.js';
import { renderSettings } from './screens/settings.js';
import { renderShooters, renderShooterEdit } from './screens/shooters.js';
import { renderExercises, renderExerciseEdit } from './screens/exercises.js';
import { renderPrep } from './screens/prep.js';
import { renderSession } from './screens/session.js';
import { renderSessions } from './screens/sessions.js';
import { renderReport } from './screens/report.js';
import { seedIfEmpty, requestPersistence } from './db/repo.js';
import { getSettings } from './settings.js';

route('home', renderHome);
route('ready', renderReady);
route('live', renderLive);
route('result', renderResult);
route('settings', renderSettings);
route('shooters', renderShooters);
route('shooter', renderShooterEdit);
route('exercises', renderExercises);
route('exercise', renderExerciseEdit);
route('prep', renderPrep);
route('session', renderSession);
route('sessions', renderSessions);
route('report', renderReport);

try {
  const s = getSettings();
  await seedIfEmpty({ min: s.delayMin, max: s.delayMax });
} catch (err) {
  console.error('IndexedDB indisponible', err);
}
requestPersistence();

// iOS n'autorise le son qu'après un geste : chaque toucher (re)débloque le contexte audio.
const unlock = () => engine.unlock();
document.addEventListener('touchend', unlock, { passive: true });
document.addEventListener('click', unlock);

// Un rechargement sur « Tir en cours » ou « Résultat » n'a plus de contexte : retour à l'accueil.
// (Une série enregistrée, #/result?string=…, se recharge sans problème.)
if (/^#\/(live|ready)/.test(location.hash) || /^#\/result(?!.*string=)/.test(location.hash)) {
  history.replaceState(null, '', '#/home');
}

startRouter(document.getElementById('app'));

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js');
}

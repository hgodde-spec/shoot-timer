// Garde l'écran allumé pendant un exercice (Screen Wake Lock, Safari 16.4+).
// Le verrou est perdu quand la page passe en arrière-plan : on le reprend au retour.

let sentinel = null;
let wanted = false;

async function acquire() {
  if (!('wakeLock' in navigator) || sentinel) return;
  try {
    sentinel = await navigator.wakeLock.request('screen');
    sentinel.addEventListener('release', () => { sentinel = null; });
  } catch { /* refusé (batterie faible…) : on n'insiste pas */ }
}

document.addEventListener('visibilitychange', () => {
  if (wanted && document.visibilityState === 'visible') acquire();
});

export const wakeLockSupported = 'wakeLock' in navigator;

export function keepAwake(on) {
  wanted = on;
  if (on) acquire();
  else if (sentinel) { sentinel.release().catch(() => {}); sentinel = null; }
}

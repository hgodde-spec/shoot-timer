// Réglages persistants (localStorage). Inclus dans la sauvegarde JSON (étape 2).

const KEY = 'shot-timer.settings';

export const DEFAULTS = {
  thresholdDb: -6,       // seuil de détection en dBFS (0 = pleine échelle)
  deadTimeMs: 80,        // temps mort entre deux tirs
  delayMin: 2,           // délai aléatoire par défaut (s)
  delayMax: 4,
  beepVolume: 1,         // 0..1
  beepFreq: 2700,        // Hz
  beepMs: 250,
  beepSquare: true,      // onde carrée = bip plus « percutant »
  flash: true,
  autoStop: true,        // arrêt auto quand le nombre de tirs attendu est atteint
  autoStopDelayMs: 1000,
  latencyMs: 0,          // latence aller-retour mesurée (sortie + entrée)
  simulation: false,     // affiche le bouton « Tir simulé »
};

let current = load();
const listeners = new Set();

function load() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

export function getSettings() {
  return current;
}

export function updateSettings(patch) {
  current = { ...current, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* stockage plein / privé */ }
  listeners.forEach((fn) => fn(current, patch));
}

export function onSettingsChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const dbToAmp = (db) => Math.pow(10, db / 20);
export const ampToDb = (a) => (a <= 0 ? -Infinity : 20 * Math.log10(a));

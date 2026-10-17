// Sauvegarde / restauration complète en JSON (données + réglages).
// Indispensable : Safari peut effacer le stockage d'une app peu utilisée.

import { STORES, dumpAll, replaceAll } from './idb.js';
import { DEFAULTS, getSettings, updateSettings } from '../settings.js';
import { deliverFile, isoDay } from '../share.js';

const FORMAT = 1;
const LAST_KEY = 'shot-timer.lastBackupAt';

export async function exportBackup() {
  const data = await dumpAll();
  const payload = {
    app: 'shot-timer',
    format: FORMAT,
    exportedAt: new Date().toISOString(),
    settings: getSettings(),
    data,
  };
  const blob = new Blob([JSON.stringify(payload, null, 1)], { type: 'application/json' });
  const result = await deliverFile(blob, `shot-timer-sauvegarde-${isoDay()}.json`, 'Sauvegarde Shot Timer');
  if (result !== 'cancelled') localStorage.setItem(LAST_KEY, payload.exportedAt);
  return { result, counts: countsOf(data) };
}

export function countsOf(data) {
  return Object.fromEntries(STORES.map((s) => [s, (data[s] || []).length]));
}

// Lit et vérifie un fichier ; ne modifie rien. Lève une Error au message lisible.
export async function readBackupFile(file) {
  let payload;
  try {
    payload = JSON.parse(await file.text());
  } catch {
    throw new Error('Fichier illisible : ce n\'est pas un JSON valide.');
  }
  if (!payload || payload.app !== 'shot-timer' || typeof payload.data !== 'object') {
    throw new Error('Ce fichier n\'est pas une sauvegarde Shot Timer.');
  }
  if (payload.format > FORMAT) {
    throw new Error('Sauvegarde créée par une version plus récente de l\'app : mettez l\'app à jour.');
  }
  for (const s of STORES) {
    const list = payload.data[s] ?? [];
    if (!Array.isArray(list) || list.some((x) => !x || typeof x.id !== 'string')) {
      throw new Error(`Sauvegarde endommagée (${s}).`);
    }
  }
  return { payload, counts: countsOf(payload.data) };
}

// Remplace toutes les données par celles de la sauvegarde (transaction unique).
export async function restoreBackup(payload) {
  await replaceAll(payload.data);
  if (payload.settings && typeof payload.settings === 'object') {
    const clean = {};
    for (const k of Object.keys(DEFAULTS)) if (k in payload.settings) clean[k] = payload.settings[k];
    updateSettings(clean);
  }
}

export function lastBackupAt() {
  const v = localStorage.getItem(LAST_KEY);
  return v ? new Date(v) : null;
}

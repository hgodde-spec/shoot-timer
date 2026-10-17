// Petits utilitaires d'interface partagés par les écrans.

import { ampToDb } from './settings.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// 1.4823 → « 1,48 »
export function fmt(t, digits = 2) {
  if (t == null || !isFinite(t)) return '–';
  return t.toFixed(digits).replace('.', ',');
}

export function fmtSigned(t) {
  if (t == null || !isFinite(t)) return '–';
  return (t < 0 ? '−' : '+') + fmt(Math.abs(t));
}

export function delayLabel(delay) {
  if (!delay) return '';
  return delay.mode === 'fixed' ? `Délai ${fmt(delay.min, 1)} s`
    : `Délai ${fmt(delay.min, 1)}–${fmt(delay.max, 1)} s`;
}

let toastTimer;
export function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

export function flash() {
  const el = $('#flash');
  el.classList.remove('on');
  void el.offsetWidth;          // relance l'animation
  el.classList.add('on');
}

// Vu-mètre : échelle en dB de -60 à 0 dBFS, repère de seuil, maintien de crête.
export const METER_FLOOR_DB = -60;
export const dbToPct = (db) =>
  Math.max(0, Math.min(100, ((db - METER_FLOOR_DB) / -METER_FLOOR_DB) * 100));

export function meterHTML(extraClass = '') {
  return `<div class="meter ${extraClass}" role="img" aria-label="Niveau micro">
    <div class="meter-bar"></div><div class="meter-hold"></div><div class="meter-thr"></div>
  </div>`;
}

export function bindMeter(root, getThresholdDb) {
  const bar = $('.meter-bar', root);
  const hold = $('.meter-hold', root);
  const thr = $('.meter-thr', root);
  let holdDb = -Infinity;
  let holdAt = 0;
  thr.style.left = dbToPct(getThresholdDb()) + '%';
  return {
    update(peak) {
      const db = ampToDb(peak);
      const now = performance.now();
      if (db > holdDb || now - holdAt > 1500) { holdDb = db; holdAt = now; }
      bar.style.width = dbToPct(db) + '%';
      hold.style.left = dbToPct(holdDb) + '%';
      const t = getThresholdDb();
      thr.style.left = dbToPct(t) + '%';
      bar.classList.toggle('over', db >= t);
      return db;
    },
    get holdDb() { return holdDb; },
  };
}

// Stepper à gros boutons (utilisable avec des gants). Les clics portent data-step="clé:±1".
export function stepperHTML(key, label, valueText, { dark = false } = {}) {
  return `<div class="stepper-row ${dark ? '' : 'light'}">
    <span>${label}</span>
    <div class="stepper">
      <button type="button" class="btn-step" data-step="${key}:-1" aria-label="${label} : diminuer">−</button>
      <output data-val="${key}">${valueText}</output>
      <button type="button" class="btn-step" data-step="${key}:1" aria-label="${label} : augmenter">+</button>
    </div>
  </div>`;
}

export function topbar(backLabel, right = '') {
  return `<div class="topbar"><button class="link" data-act="back">‹ ${esc(backLabel)}</button>${right}</div>`;
}

// « 2026-10-17 » → « sam. 17 oct. » (date locale, sans décalage de fuseau).
const DATE_SHORT = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
const DATE_LONG = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const parseDay = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const fmtDay = (s) => (s ? DATE_SHORT.format(parseDay(s)) : '');
export const fmtDayLong = (s) => (s ? DATE_LONG.format(parseDay(s)) : '');

export const STATUS_LABEL = { prepared: 'Préparée', running: 'En cours', closed: 'Clôturée' };

// Résultat d'une série en une ligne : « 2,31 s ✓ ».
export function stringResultHTML(str) {
  const cls = str.parOk === true ? 'ok' : str.parOk === false ? 'ko' : '';
  const mark = str.parOk === true ? ' ✓' : str.parOk === false ? ' ✗' : '';
  return `<strong class="${cls}">${str.total == null ? '–' : fmt(str.total) + ' s'}${mark}</strong>`;
}

const RTF =new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });
export function relativeDays(date) {
  if (!date) return 'jamais';
  const days = Math.round((date - new Date()) / 86400000);
  return days === 0 ? "aujourd'hui" : RTF.format(days, 'day');
}

export const micChip = (state) => {
  const label = { on: 'Micro OK', starting: 'Micro…', denied: 'Micro refusé', error: 'Micro HS', off: 'Micro coupé' }[state] || 'Micro';
  return `<span class="mic-chip mic-${state}">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"></rect><path d="M5 11a7 7 0 0 0 14 0M12 18v3"></path></svg>${label}</span>`;
};

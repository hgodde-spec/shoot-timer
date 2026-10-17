// Écran 9 — Réglages : seuil + vu-mètre en direct (avec test de détection),
// temps mort, délai, bip, flash, arrêt auto, latence, mode simulation.

import { engine } from '../audio/engine.js';
import { getSettings, updateSettings } from '../settings.js';
import { wakeLockSupported } from '../timer/wakelock.js';
import { $, fmt, meterHTML, bindMeter, micChip, toast, flash, relativeDays } from '../ui.js';
import { exportBackup, readBackupFile, restoreBackup, lastBackupAt, countsOf } from '../db/backup.js';
import { dumpAll } from '../db/idb.js';

const countsText = (c) =>
  `${c.shooters} tireur${c.shooters > 1 ? 's' : ''}, ${c.exercises} exercice${c.exercises > 1 ? 's' : ''}, ` +
  `${c.sessions} session${c.sessions > 1 ? 's' : ''}, ${c.strings} série${c.strings > 1 ? 's' : ''}`;

const range = (key, label, min, max, step, unit, format = (v) => v) => `
  <label class="field">
    <span class="field-head"><span>${label}</span><output data-out="${key}">${format(getSettings()[key])}${unit}</output></span>
    <input type="range" data-key="${key}" min="${min}" max="${max}" step="${step}" value="${getSettings()[key]}">
  </label>`;

const toggle = (key, label, hint = '') => `
  <label class="toggle">
    <span><span class="toggle-label">${label}</span>${hint ? `<small>${hint}</small>` : ''}</span>
    <input type="checkbox" data-key="${key}" ${getSettings()[key] ? 'checked' : ''}>
  </label>`;

const FORMATS = {
  thresholdDb: (v) => v,
  delayMin: (v) => fmt(+v, 1),
  delayMax: (v) => fmt(+v, 1),
  beepVolume: (v) => Math.round(v * 100),
  autoStopDelayMs: (v) => fmt(v / 1000, 1),
};
const UNITS = { thresholdDb: ' dB', deadTimeMs: ' ms', delayMin: ' s', delayMax: ' s', beepVolume: ' %', beepFreq: ' Hz', autoStopDelayMs: ' s' };

export function renderSettings(root) {
  const s = getSettings();
  root.innerHTML = `
  <div class="screen">
    <div class="topbar">
      <button class="link" data-act="back">‹ Retour</button>
      <span id="mic">${micChip(engine.micState)}</span>
    </div>
    <h1 class="h-display">RÉGLAGES</h1>

    <section class="panel">
      <h2 class="h-section">DÉTECTION DES TIRS</h2>
      <div class="meter-readout"><span>Niveau <strong id="lvl">–</strong> dB</span><span>Pic <strong id="pk">–</strong> dB</span></div>
      ${meterHTML('meter-big')}
      <div class="detect-test">
        <span id="det-dot" class="det-dot"></span>
        <span>Tirs détectés : <strong id="det-n">0</strong></span>
        <button class="btn-small" data-act="det-reset">Remettre à 0</button>
      </div>
      ${range('thresholdDb', 'Seuil', -40, 0, 1, ' dB', FORMATS.thresholdDb)}
      <button class="btn-secondary" data-act="thr-peak">Placer le seuil 6 dB sous le pic</button>
      ${range('deadTimeMs', 'Temps mort entre deux tirs', 20, 300, 10, ' ms')}
      <p class="hint">Tirez (ou frappez dans les mains) : le repère orange est le seuil. Chaque tir doit dépasser le seuil, le bruit ambiant et les voisins doivent rester dessous.</p>
    </section>

    <section class="panel">
      <h2 class="h-section">DÉPART</h2>
      ${range('delayMin', 'Délai aléatoire min.', 0.5, 10, 0.5, ' s', FORMATS.delayMin)}
      ${range('delayMax', 'Délai aléatoire max.', 0.5, 10, 0.5, ' s', FORMATS.delayMax)}
      ${range('beepVolume', 'Volume du bip', 0.1, 1, 0.05, ' %', FORMATS.beepVolume)}
      ${range('beepFreq', 'Fréquence du bip', 1500, 4000, 100, ' Hz')}
      ${toggle('beepSquare', 'Bip renforcé', 'Onde carrée, plus audible sous casque')}
      <button class="btn-secondary" data-act="beep">Tester le bip</button>
      ${toggle('flash', 'Flash plein écran au départ')}
    </section>

    <section class="panel">
      <h2 class="h-section">ARRÊT</h2>
      ${toggle('autoStop', 'Arrêt automatique', 'Quand le nombre de tirs attendu est atteint')}
      ${range('autoStopDelayMs', 'Délai avant arrêt auto', 0, 3000, 250, ' s', FORMATS.autoStopDelayMs)}
    </section>

    <section class="panel">
      <h2 class="h-section">LATENCE AUDIO</h2>
      <div class="kv"><span>Correction appliquée</span><strong id="lat">${s.latencyMs} ms</strong></div>
      <p class="hint">Dans le calme, téléphone posé : l'app joue 3 bips et mesure quand le micro les entend. Cette durée est retirée de chaque temps de tir.</p>
      <div class="grid-2">
        <button class="btn-secondary" data-act="lat">Mesurer</button>
        <button class="btn-secondary" data-act="lat0">Remettre à 0</button>
      </div>
    </section>

    <section class="panel">
      <h2 class="h-section">TEST</h2>
      ${toggle('simulation', 'Mode simulation', 'Ajoute un bouton « Tir simulé » pendant le tir')}
    </section>

    <section class="panel">
      <h2 class="h-section">SAUVEGARDE</h2>
      <div class="kv"><span>Dernière sauvegarde</span><strong id="last-bk">${relativeDays(lastBackupAt())}</strong></div>
      <div class="kv"><span>Contenu</span><strong id="counts">…</strong></div>
      <div class="kv"><span>Stockage protégé</span><strong id="persist">…</strong></div>
      <p class="hint">Le fichier contient tireurs, exercices, sessions, séries et réglages. Sur iPhone, choisissez « Enregistrer dans Fichiers » (iCloud Drive) ou envoyez-le-vous par mail.</p>
      <button class="btn-secondary" data-act="export">Exporter la sauvegarde</button>
      <label class="btn-secondary btn-file">Restaurer depuis un fichier
        <input type="file" id="restore" accept="application/json,.json">
      </label>
    </section>

    <section class="panel diag" id="diag"></section>
  </div>`;

  const meter = bindMeter(root, () => getSettings().thresholdDb);
  let detected = 0;

  const drawDiag = () => {
    $('#diag', root).innerHTML = `
      <div class="kv"><span>Détecteur</span><strong>${engine.mode === 'worklet' ? 'AudioWorklet' : engine.mode === 'script' ? 'ScriptProcessor (repli)' : '–'}</strong></div>
      <div class="kv"><span>Fréquence d'échantillonnage</span><strong>${engine.ctx ? engine.ctx.sampleRate + ' Hz' : '–'}</strong></div>
      <div class="kv"><span>Session audio iOS</span><strong>${navigator.audioSession ? navigator.audioSession.type : 'non disponible'}</strong></div>
      <div class="kv"><span>Écran allumé (Wake Lock)</span><strong>${wakeLockSupported ? 'oui' : 'non — réglez Verrouillage auto. sur Jamais'}</strong></div>
      ${engine.micError ? `<p class="warn">${engine.micError}</p>` : ''}`;
  };

  const onLevel = (e) => {
    const db = meter.update(e.detail);
    $('#lvl', root).textContent = isFinite(db) ? Math.round(db) : '–∞';
    $('#pk', root).textContent = isFinite(meter.holdDb) ? Math.round(meter.holdDb) : '–∞';
  };
  const onShot = () => {
    detected += 1;
    $('#det-n', root).textContent = detected;
    const dot = $('#det-dot', root);
    dot.classList.remove('hit'); void dot.offsetWidth; dot.classList.add('hit');
  };
  const onMic = () => {
    $('#mic', root).innerHTML = micChip(engine.micState);
    if (engine.micState === 'on') engine.arm(engine.now());
    drawDiag();
  };

  engine.addEventListener('level', onLevel);
  engine.addEventListener('shot', onShot);
  engine.addEventListener('mic', onMic);
  engine.startMic().then(() => { if (engine.micState === 'on') engine.arm(engine.now()); drawDiag(); });
  drawDiag();

  dumpAll().then((d) => { $('#counts', root).textContent = countsText(countsOf(d)); })
    .catch(() => { $('#counts', root).textContent = 'base indisponible'; });
  (navigator.storage?.persisted ? navigator.storage.persisted() : Promise.resolve(false))
    .then((p) => { $('#persist', root).textContent = p ? 'oui' : 'non — sauvegardez souvent'; });

  $('#restore', root).addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const { payload, counts } = await readBackupFile(file);
      const when = new Date(payload.exportedAt).toLocaleString('fr-FR');
      if (!confirm(`Restaurer la sauvegarde du ${when} ?\n${countsText(counts)}.\n\nToutes les données actuelles seront remplacées.`)) return;
      await restoreBackup(payload);
      toast('Sauvegarde restaurée');
      setTimeout(() => location.reload(), 800);
    } catch (err) {
      toast(err.message);
    }
  });

  root.addEventListener('input', (e) => {
    const key = e.target.dataset.key;
    if (!key) return;
    const v = e.target.type === 'checkbox' ? e.target.checked : +e.target.value;
    const patch = { [key]: v };
    // Garder min ≤ max pour le délai.
    if (key === 'delayMin' && v > getSettings().delayMax) patch.delayMax = v;
    if (key === 'delayMax' && v < getSettings().delayMin) patch.delayMin = v;
    updateSettings(patch);
    if (key === 'thresholdDb') meter.update(engine.lastLevel);
    for (const k of Object.keys(patch)) {
      const out = root.querySelector(`[data-out="${k}"]`);
      if (out) out.textContent = (FORMATS[k] || ((x) => x))(patch[k]) + (UNITS[k] || '');
      const inp = root.querySelector(`input[data-key="${k}"]`);
      if (inp && inp !== e.target) inp.value = patch[k];
    }
  });

  root.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    const act = btn?.dataset.act;
    if (!act) return;
    engine.unlock();
    if (act === 'back') history.back();
    if (act === 'export') {
      try {
        const { result, counts } = await exportBackup();
        if (result !== 'cancelled') {
          $('#last-bk', root).textContent = relativeDays(lastBackupAt());
          toast(`Sauvegarde exportée (${countsText(counts)})`);
        }
      } catch (err) {
        toast('Échec de la sauvegarde : ' + err.message);
      }
    }
    if (act === 'det-reset') { detected = 0; $('#det-n', root).textContent = '0'; }
    if (act === 'thr-peak') {
      if (!isFinite(meter.holdDb)) return toast('Aucun pic mesuré');
      const v = Math.max(-40, Math.min(0, Math.round(meter.holdDb - 6)));
      updateSettings({ thresholdDb: v });
      $('input[data-key="thresholdDb"]', root).value = v;
      $('[data-out="thresholdDb"]', root).textContent = v + ' dB';
    }
    if (act === 'beep') {
      const b = engine.scheduleBeep(engine.now() + 0.05);
      engine.arm(b.end + 0.03);             // le bip de test ne compte pas comme un tir
      if (getSettings().flash) setTimeout(flash, 50);
    }
    if (act === 'lat' || act === 'lat0') {
      let ms = 0;
      if (act === 'lat') {
        btn.disabled = true;
        btn.textContent = 'Mesure…';
        engine.disarm();
        ms = await engine.measureLatency();
        engine.arm(engine.now() + 0.5);
        btn.disabled = false;
        btn.textContent = 'Mesurer';
        if (ms == null) return toast('Bip non entendu par le micro : montez le volume');
        if (ms < 0 || ms > 500) return toast(`Mesure incohérente (${ms} ms), recommencez au calme`);
      }
      updateSettings({ latencyMs: ms });
      $('#lat', root).textContent = ms + ' ms';
      toast(`Latence : ${ms} ms`);
    }
  });

  return () => {
    engine.disarm();
    engine.removeEventListener('level', onLevel);
    engine.removeEventListener('shot', onShot);
    engine.removeEventListener('mic', onMic);
  };
}

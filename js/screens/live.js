// Écran 5 — Tir en cours : « Attention… », bip + flash, chrono, splits, vu-mètre, STOP.

import { engine } from '../audio/engine.js';
import { go, replace } from '../router.js';
import { appState } from '../state.js';
import { getSettings } from '../settings.js';
import { TimerRun } from '../timer/run.js';
import { $, esc, fmt, flash, meterHTML, bindMeter } from '../ui.js';

export function renderLive(root) {
  const ctx = appState.context;
  if (!ctx) { go('home'); return; }
  const { shooter, exercise: ex } = ctx;
  const settings = getSettings();

  root.innerHTML = `
  <div class="screen screen-white">
    <div class="live-head">
      <div class="who">${esc(shooter.name)} · ${esc(ex.name)}</div>
      ${ex.par ? `<div class="muted">Par ${fmt(ex.par)} s</div>` : ''}
    </div>
    <div class="status" id="status"><span class="dot"></span><span id="status-text">Attention…</span></div>
    <div class="clock-wrap">
      <div class="clock" id="clock">ATTENTION</div>
      <div class="clock-unit" id="unit">attendez le bip</div>
    </div>
    <div class="shot-count"><span id="count">0</span> / ${ex.shots}</div>
    <div class="shot-dots" id="dots">${'<span class="dot-shot"></span>'.repeat(Math.min(ex.shots, 12))}</div>
    <div class="splits" id="splits"></div>
    <div class="meter-block">
      <div class="eyebrow">Niveau micro</div>
      ${meterHTML()}
    </div>
    <div class="spacer"></div>
    ${settings.simulation ? '<button class="btn-sim" data-act="sim">TIR SIMULÉ</button>' : ''}
    <button class="btn-stop" data-act="stop">STOP</button>
  </div>`;

  const clock = $('#clock', root);
  const unit = $('#unit', root);
  const statusText = $('#status-text', root);
  const status = $('#status', root);
  const meter = bindMeter(root, () => getSettings().thresholdDb);

  const run = new TimerRun({ expected: ex.shots, par: ex.par, delay: ex.delay });

  run.addEventListener('beep', () => {
    if (getSettings().flash) flash();
    statusText.textContent = 'Écoute en cours';
    status.classList.add('on');
    clock.classList.add('running');
    unit.textContent = 'secondes';
  });
  run.addEventListener('tick', (e) => { clock.textContent = fmt(e.detail); });
  run.addEventListener('shot', () => {
    const n = run.shots.length;
    $('#count', root).textContent = n;
    const dots = root.querySelectorAll('.dot-shot');
    if (dots[n - 1]) dots[n - 1].classList.add('hit');
    const list = $('#splits', root);
    const t = run.shots[n - 1].t;
    const split = n === 1 ? fmt(t) + ' s' : '+' + fmt(t - run.shots[n - 2].t) + ' s';
    list.insertAdjacentHTML('beforeend', `<div class="split-row"><span>Tir ${n}</span><strong>${split}</strong></div>`);
    list.scrollTop = list.scrollHeight;
  });
  run.addEventListener('state', (e) => {
    if (e.detail === 'cancelled') history.back();
  });
  run.addEventListener('done', () => {
    appState.lastRun = {
      shots: run.shots.map((s) => ({ ...s })),
      duration: run.duration,
      at: new Date().toISOString(),
    };
    replace('result');
  });

  const onLevel = (e) => meter.update(e.detail);
  engine.addEventListener('level', onLevel);

  root.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'stop') run.stop();
    if (act === 'sim') run.simulateShot();
  });

  run.start();

  return () => {
    engine.removeEventListener('level', onLevel);
    run.abort();   // sortie par Précédent : on abandonne sans enregistrer
  };
}

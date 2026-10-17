// Écran 4 — Exercice prêt : un très gros bouton DÉMARRER.

import { engine } from '../audio/engine.js';
import { go } from '../router.js';
import { appState } from '../state.js';
import { getSettings } from '../settings.js';
import { $, esc, fmt, delayLabel, micChip, toast } from '../ui.js';

export function renderReady(root) {
  const ctx = appState.context;
  if (!ctx) { go('home'); return; }
  const { shooter, exercise: ex } = ctx;

  root.innerHTML = `
  <div class="screen">
    <div class="topbar">
      <button class="link" data-act="back">‹ ${ctx.mode === 'free' ? 'Accueil' : 'Session'}</button>
      <span id="mic">${micChip(engine.micState)}</span>
    </div>
    <div class="title-block">
      <div class="who">${esc(shooter.name)}</div>
      <h1 class="h-display">${esc(ex.name.toUpperCase())}</h1>
      <div class="chips">
        <span class="chip">${ex.shots} tir${ex.shots > 1 ? 's' : ''}</span>
        ${ex.par ? `<span class="chip">Par ${fmt(ex.par)} s</span>` : ''}
        <span class="chip">${delayLabel(ex.delay)}</span>
      </div>
    </div>
    <button class="btn-start" data-act="start">
      <svg width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M10 8.5l5 3.5-5 3.5z"></path></svg>
      <span class="btn-start-label">DÉMARRER</span>
      <span class="btn-start-hint">Toucher n'importe où sur le bouton</span>
    </button>
    <div class="foot-info"><span id="micmsg">${esc(engine.micError)}</span><span>Série n° ${ctx.stringNo}</span></div>
  </div>`;

  const onMic = () => {
    $('#mic', root).innerHTML = micChip(engine.micState);
    $('#micmsg', root).textContent = engine.micError;
  };
  engine.addEventListener('mic', onMic);
  engine.startMic();

  root.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'back') history.back();
    if (act === 'start') {
      engine.unlock();                       // dans le geste : indispensable sur iOS
      if (engine.micState !== 'on' && !(await engine.startMic()) && !getSettings().simulation) {
        toast('Micro indisponible — activez le mode simulation dans Réglages pour tester');
        return;
      }
      go('live');
    }
  });

  return () => engine.removeEventListener('mic', onMic);
}

// Écran 1 — Accueil : session du jour, raccourcis, tir libre (sans enregistrement).

import { go } from '../router.js';
import { appState, freeContext } from '../state.js';
import { $, fmt, esc, relativeDays, fmtDay, stepperHTML } from '../ui.js';
import { lastBackupAt } from '../db/backup.js';
import { getAll } from '../db/idb.js';
import { currentSession, listStrings } from '../db/repo.js';
import { isoDay } from '../share.js';

const DAYS = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const BACKUP_EVERY_DAYS = 7;

const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`;

export async function renderHome(root) {
  let hasUserData = false;
  let session = null;
  let nStrings = 0;
  try {
    hasUserData = (await getAll('shooters')).length > 0 || (await getAll('strings')).length > 0;
    session = await currentSession(isoDay());
    if (session) nStrings = (await listStrings(session.id)).length;
  } catch (err) { console.error(err); }

  const last = lastBackupAt();
  // Rappel de sauvegarde seulement s'il y a des données saisies.
  const backupDue = hasUserData && (!last || Date.now() - last > BACKUP_EVERY_DAYS * 86400000);
  const cfg = appState.freeConfig || (appState.freeConfig = { shots: 2, par: 2.5 });
  const free = appState.freeHistory.slice(-3).reverse();
  const isToday = session && session.date === isoDay();

  root.innerHTML = `
  <div class="screen">
    <header class="title-block">
      <div class="eyebrow">${esc(DAYS.format(new Date()))}</div>
      <h1 class="h-display">SHOT TIMER</h1>
    </header>

    ${session ? `
    <section class="card-dark">
      <div class="eyebrow eyebrow-warm">${session.status === 'running' ? 'Session en cours'
        : isToday ? 'Session du jour' : 'Prochaine session · ' + esc(fmtDay(session.date))}</div>
      <div class="card-title">${esc(session.place || 'Session')}${session.comment ? ` · <span class="card-sub">${esc(session.comment)}</span>` : ''}</div>
      <div class="card-meta">${plural(session.shooterIds.length, 'tireur')} · ${plural(session.exerciseIds.length, 'exercice')} · ${plural(nStrings, 'série')}</div>
      <button class="btn-primary" data-act="resume">${session.status === 'running' ? 'REPRENDRE LA SESSION' : 'COMMENCER LA SESSION'}</button>
    </section>` : `
    <section class="card-dark">
      <div class="eyebrow eyebrow-warm">Session du jour</div>
      <div class="card-meta">Aucune session préparée.</div>
      <button class="btn-primary" data-act="new">PRÉPARER UNE SESSION</button>
    </section>`}

    <div class="grid-2">
      <button class="btn-tile" data-act="new"><span>NOUVELLE SESSION</span><small>Préparer le cours</small></button>
      <button class="btn-tile" data-act="sessions"><span>SESSIONS PASSÉES</span><small>Rapports, export</small></button>
    </div>

    <nav class="list-card">
      <button class="list-row" data-act="shooters"><span>Tireurs</span><span class="chev">›</span></button>
      <button class="list-row" data-act="exercises"><span>Exercices</span><span class="chev">›</span></button>
      <button class="list-row" data-act="settings"><span>Réglages du timer</span><span class="chev">›</span></button>
    </nav>

    ${backupDue ? `<button class="backup-nag" data-act="settings">
      <strong>Pensez à sauvegarder</strong>
      <span>Dernière sauvegarde : ${esc(relativeDays(last))}. Safari peut effacer les données d'une app peu utilisée.</span>
    </button>` : ''}

    <section class="panel">
      <div class="section-head"><h2 class="h-section">TIR LIBRE</h2><span class="muted">Sans enregistrement</span></div>
      ${stepperHTML('shots', 'Tirs attendus', cfg.shots)}
      ${stepperHTML('par', 'Par time', cfg.par ? fmt(cfg.par) + ' s' : 'aucun')}
      <button class="btn-secondary" data-act="free">Lancer un tir libre</button>
      ${free.length ? free.map((r) => `<div class="recent"><span>${esc(r.label)}</span>
        <strong class="${r.parOk === true ? 'ok' : r.parOk === false ? 'ko' : ''}">${fmt(r.total)} s ${r.parOk === true ? '✓' : r.parOk === false ? '✗' : ''}</strong></div>`).join('') : ''}
    </section>
  </div>`;

  root.addEventListener('click', (e) => {
    const step = e.target.closest('[data-step]');
    if (step) {
      const [k, d] = step.dataset.step.split(':');
      if (k === 'shots') cfg.shots = Math.min(30, Math.max(1, cfg.shots + +d));
      if (k === 'par') {
        const p = (cfg.par || 0) + +d * 0.25;
        cfg.par = p < 0.5 ? (+d > 0 ? 0.5 : null) : +p.toFixed(2);
      }
      $('[data-val="shots"]', root).textContent = cfg.shots;
      $('[data-val="par"]', root).textContent = cfg.par ? fmt(cfg.par) + ' s' : 'aucun';
      return;
    }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'resume') go('session', { id: session.id });
    if (act === 'new') { appState.prepDraft = null; go('prep'); }
    if (act === 'sessions') go('sessions');
    if (act === 'free') { appState.context = freeContext(cfg); go('ready'); }
    if (act === 'settings') go('settings');
    if (act === 'shooters') go('shooters');
    if (act === 'exercises') go('exercises');
  });
}

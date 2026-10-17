// Écran 3 — Session en cours : qui tire ? → quel exercice ? ; dernières séries en bas.

import { go, replace } from '../router.js';
import { appState } from '../state.js';
import { getSession, sessionMembers, listStrings, setSessionStatus } from '../db/repo.js';
import { $, esc, fmt, fmtDay, toast, stringResultHTML } from '../ui.js';

export async function renderSession(root, { id }) {
  let session = await getSession(id);
  if (!session) { go('home'); return; }
  const { shooters, exercises } = await sessionMembers(session);
  const strings = await listStrings(id);
  const closed = session.status === 'closed';

  appState.selShooter ??= {};
  let sel = appState.selShooter[id];
  if (!shooters.some((s) => s.id === sel)) sel = shooters[0]?.id;

  const countFor = (shooterId) => strings.filter((s) => s.shooterId === shooterId).length;

  root.innerHTML = `
  <div class="screen">
    <div class="topbar">
      <button class="link" data-act="home">‹ Accueil</button>
      <span class="topbar-right">
        <button class="link" data-act="edit">Modifier</button>
        <button class="link" data-act="report">${closed ? 'Rapport' : 'Terminer'}</button>
      </span>
    </div>
    <div class="title-block">
      <div class="eyebrow">${esc(fmtDay(session.date))}${session.place ? ' · ' + esc(session.place) : ''}</div>
      <h1 class="h-display">QUI TIRE ?</h1>
    </div>
    ${closed ? `<div class="warn closed-banner"><span>Session clôturée</span>
      <button class="btn-small" data-act="reopen">Rouvrir</button></div>` : ''}
    <div class="shooter-pills" id="shooters"></div>
    <h2 class="h-section">EXERCICE</h2>
    <div class="ex-grid">
      ${exercises.map((ex) => `
        <button class="ex-btn" data-ex="${ex.id}" ${closed ? 'disabled' : ''}>
          <span class="ex-btn-name">${esc(ex.name.toUpperCase())}</span>
          <span class="ex-btn-meta">${ex.shots} tir${ex.shots > 1 ? 's' : ''}${ex.par ? ' · par ' + fmt(ex.par) + ' s' : ''}</span>
        </button>`).join('')}
    </div>
    <section class="list-card pad">
      <div class="eyebrow">Dernières séries${strings.length ? ` (${strings.length})` : ''}</div>
      ${strings.length ? strings.slice(-6).reverse().map((s) => `
        <button class="recent recent-btn" data-string="${s.id}">
          <span>${esc(s.shooterName)} · ${esc(s.exerciseName)}</span>${stringResultHTML(s)}
        </button>`).join('')
      : '<div class="muted">Aucune série pour l\'instant.</div>'}
    </section>
  </div>`;

  function drawShooters() {
    $('#shooters', root).innerHTML = shooters.map((s) => `
      <button class="shooter-pill ${s.id === sel ? 'on' : ''}" data-shooter="${s.id}" aria-pressed="${s.id === sel}">
        <span class="shooter-name">${esc(s.name)}</span>
        <small>${countFor(s.id)} série${countFor(s.id) > 1 ? 's' : ''}</small>
      </button>`).join('');
  }
  drawShooters();

  root.addEventListener('click', async (e) => {
    const sh = e.target.closest('[data-shooter]');
    if (sh) { sel = appState.selShooter[id] = sh.dataset.shooter; return drawShooters(); }

    const exBtn = e.target.closest('[data-ex]');
    if (exBtn) {
      const shooter = shooters.find((s) => s.id === sel);
      const exercise = exercises.find((x) => x.id === exBtn.dataset.ex);
      if (!shooter) return toast('Choisissez d\'abord le tireur');
      // La session préparée passe « en cours » à la première série lancée.
      if (session.status === 'prepared') session = await setSessionStatus(session, 'running');
      appState.context = {
        mode: 'session',
        sessionId: id,
        shooters,                 // ordre de passage, pour « Tireur suivant »
        shooter,
        exercise,
        stringNo: strings.filter((s) => s.shooterId === shooter.id && s.exerciseId === exercise.id).length + 1,
      };
      return go('ready');
    }

    const row = e.target.closest('[data-string]');
    if (row) return go('result', { string: row.dataset.string });

    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'home') go('home');
    if (act === 'edit') go('prep', { id });
    if (act === 'reopen') { await setSessionStatus(session, 'running'); replace('session', { id }); }
    // « Terminer » ouvre le rapport ; la clôture se fait depuis le rapport.
    if (act === 'report') go('report', { id });
  });
}

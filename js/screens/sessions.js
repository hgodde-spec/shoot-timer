// Sessions passées et à venir : liste par date, statut, nombre de séries.

import { go } from '../router.js';
import { appState } from '../state.js';
import { listSessions } from '../db/repo.js';
import { getAll } from '../db/idb.js';
import { esc, fmtDay, topbar, STATUS_LABEL } from '../ui.js';

export async function renderSessions(root) {
  const [sessions, strings] = await Promise.all([listSessions(), getAll('strings')]);
  const count = new Map();
  for (const s of strings) count.set(s.sessionId, (count.get(s.sessionId) || 0) + 1);

  root.innerHTML = `
  <div class="screen">
    ${topbar('Accueil')}
    <div class="section-head"><h1 class="h-display">SESSIONS</h1><span class="muted">${sessions.length}</span></div>
    <button class="btn-primary" data-act="new">+ NOUVELLE SESSION</button>
    ${sessions.length ? `<div class="list-card">${sessions.map((s) => {
      const n = count.get(s.id) || 0;
      return `<button class="list-row two-line" data-id="${s.id}" data-closed="${s.status === 'closed'}">
        <span><span class="row-title">${esc(fmtDay(s.date))}${s.place ? ' · ' + esc(s.place) : ''}</span>
        <small>${s.shooterIds.length} tireur${s.shooterIds.length > 1 ? 's' : ''} · ${n} série${n > 1 ? 's' : ''}</small></span>
        <span class="status-tag status-${s.status}">${STATUS_LABEL[s.status]}</span>
      </button>`;
    }).join('')}</div>`
    : '<div class="empty-card">Aucune session. Préparez la prochaine à l\'avance : date, lieu, tireurs et programme.</div>'}
  </div>`;

  root.addEventListener('click', (e) => {
    const row = e.target.closest('[data-id]');
    // Session clôturée → son rapport ; sinon → la session.
    if (row) return go(row.dataset.closed === 'true' ? 'report' : 'session', { id: row.dataset.id });
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'back') go('home');
    if (act === 'new') { appState.prepDraft = null; go('prep'); }
  });
}

// Écran 7 — Rapport de fin de session : chiffres clés, synthèse par tireur / par exercice.

import { go, replace } from '../router.js';
import { appState } from '../state.js';
import { getSession, sessionMembers, listStrings, setSessionStatus } from '../db/repo.js';
import { buildSummary, pct } from '../report/summary.js';
import { loadXLSX, exportSessionXlsx } from '../export/xlsx.js';
import { $, esc, fmt, fmtDay, toast } from '../ui.js';

const t = (v) => (v == null ? '–' : fmt(v) + ' s');

function parCell(r) {
  if (!r.parCount) return '<span class="muted">–</span>';
  const cls = r.parRate >= 0.5 ? 'ok' : 'ko';
  return `<strong class="${cls}">${r.parOk}/${r.parCount}</strong>`;
}

const tableHead = (first) => `
  <div class="rep-row rep-head"><span>${first}</span><span>Meilleur</span><span>Moyenne</span><span>Par</span></div>`;

export async function renderReport(root, { id }) {
  const session = await getSession(id);
  if (!session) { go('home'); return; }
  const [{ shooters, exercises }, strings] = await Promise.all([sessionMembers(session), listStrings(id)]);
  const sum = buildSummary(session, shooters, exercises, strings);
  const closed = session.status === 'closed';
  let tab = appState.reportTab || 'shooter';

  root.innerHTML = `
  <div class="screen">
    <div class="topbar">
      <button class="link" data-act="home">‹ Accueil</button>
      <button class="link" data-act="session">Voir les séries</button>
    </div>
    <div class="title-block">
      <div class="eyebrow">${esc(fmtDay(session.date))}${session.place ? ' · ' + esc(session.place) : ''}</div>
      <h1 class="h-display">RAPPORT DE SESSION</h1>
      ${session.comment ? `<div class="muted">${esc(session.comment)}</div>` : ''}
    </div>
    <div class="kpis">
      <div class="kpi"><span>Tireurs</span><strong>${sum.nShooters}</strong></div>
      <div class="kpi"><span>Séries</span><strong>${sum.overall.count}</strong></div>
      <div class="kpi"><span>Par réussi</span><strong>${pct(sum.overall.parRate)}</strong></div>
    </div>
    ${sum.overall.count ? `
    <div class="segmented" role="tablist">
      <button data-tab="shooter" role="tab">Par tireur</button>
      <button data-tab="exercise" role="tab">Par exercice</button>
    </div>
    <div id="tables" class="rep-list"></div>
    <p class="hint">Le fichier Excel contient un onglet de synthèse et un onglet de détail avec chaque tir et chaque split.</p>`
    : '<div class="empty-card">Aucune série enregistrée dans cette session.</div>'}
    <div class="spacer"></div>
    <button class="btn-primary btn-icon" data-act="export" ${sum.overall.count ? '' : 'disabled'}>
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"></path></svg>
      EXPORTER EXCEL</button>
    ${closed
      ? '<button class="btn-secondary" data-act="reopen">Rouvrir la session</button>'
      : '<button class="btn-secondary" data-act="close">Clôturer la session</button>'}
  </div>`;

  function draw() {
    if (!sum.overall.count) return;
    root.querySelectorAll('[data-tab]').forEach((b) => {
      b.classList.toggle('on', b.dataset.tab === tab);
      b.setAttribute('aria-selected', b.dataset.tab === tab);
    });
    const html = tab === 'shooter'
      ? sum.byShooter.filter((g) => g.count).map((g) => `
        <section class="rep-card">
          <div class="rep-title"><strong>${esc(g.shooter.name)}</strong>
            <span>${g.count} série${g.count > 1 ? 's' : ''}${g.parCount ? ` · par ${g.parOk}/${g.parCount} (${pct(g.parRate)})` : ''}</span></div>
          ${tableHead('Exercice')}
          ${g.rows.map((r) => `<div class="rep-row"><span class="rep-name">${esc(r.exercise.name)}<small>${r.count} série${r.count > 1 ? 's' : ''}</small></span>
            <span>${t(r.best)}</span><span>${t(r.avg)}</span><span>${parCell(r)}</span></div>`).join('')}
        </section>`).join('')
      : sum.byExercise.filter((g) => g.count).map((g) => `
        <section class="rep-card">
          <div class="rep-title"><strong>${esc(g.exercise.name)}</strong>
            <span>${g.exercise.shots ?? '?'} tir${g.exercise.shots > 1 ? 's' : ''}${g.exercise.par ? ' · par ' + fmt(g.exercise.par) + ' s' : ''}${g.parCount ? ` · ${pct(g.parRate)} réussi` : ''}</span></div>
          ${tableHead('Tireur')}
          ${g.rows.map((r, i) => `<div class="rep-row"><span class="rep-name"><span><b class="rank">${i + 1}</b>${esc(r.shooter.name)}</span><small>${r.count} série${r.count > 1 ? 's' : ''}</small></span>
            <span>${t(r.best)}</span><span>${t(r.avg)}</span><span>${parCell(r)}</span></div>`).join('')}
        </section>`).join('');
    $('#tables', root).innerHTML = html;
  }
  draw();
  if (sum.overall.count) loadXLSX().catch(() => {});   // prêt avant le toucher sur Exporter

  root.addEventListener('click', async (e) => {
    const tb = e.target.closest('[data-tab]');
    if (tb) { tab = appState.reportTab = tb.dataset.tab; return draw(); }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'home') go('home');
    if (act === 'session') go('session', { id });
    if (act === 'export') {
      const btn = e.target.closest('[data-act]');
      if (btn.disabled) return;
      btn.disabled = true;
      try {
        const r = await exportSessionXlsx(id);
        if (r === 'shared' || r === 'downloaded') toast('Fichier Excel exporté');
      } catch (err) {
        toast('Échec de l\'export : ' + err.message);
      } finally {
        btn.disabled = false;
      }
    }
    if (act === 'close') {
      await setSessionStatus(session, 'closed');
      toast('Session clôturée');
      replace('report', { id });
    }
    if (act === 'reopen') {
      await setSessionStatus(session, 'running');
      replace('session', { id });
    }
  });
}

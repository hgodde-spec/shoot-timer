// Écran 6 — Résultat : temps, par, liste des tirs (toucher = barrer / rétablir).
// Trois usages : série libre, série de session (Valider / Refaire / Tireur suivant),
// et correction d'une série déjà enregistrée (#/result?string=<id>).

import { go } from '../router.js';
import { appState } from '../state.js';
import { computeStats, shotRows } from '../timer/stats.js';
import { getString, saveString, deleteString, listStrings } from '../db/repo.js';
import { $, esc, fmt, fmtSigned, toast, topbar } from '../ui.js';

export async function renderResult(root, params) {
  let view;       // { title, shots, expected, par }
  let mode;       // 'free' | 'session' | 'edit'
  let stored = null;
  const ctx = appState.context;

  if (params.string) {
    stored = await getString(params.string);
    if (!stored) { go('home'); return; }
    mode = 'edit';
    view = {
      who: stored.shooterName, name: stored.exerciseName,
      shots: structuredClone(stored.shots), expected: stored.expected, par: stored.par,
    };
  } else {
    const run = appState.lastRun;
    if (!ctx || !run) { go('home'); return; }
    mode = ctx.mode;
    view = {
      who: ctx.shooter.name, name: ctx.exercise.name,
      shots: run.shots, expected: ctx.exercise.shots, par: ctx.exercise.par,
    };
  }

  const nextShooter = mode === 'session' && ctx.shooters.length > 1
    ? ctx.shooters[(ctx.shooters.findIndex((s) => s.id === ctx.shooter.id) + 1) % ctx.shooters.length]
    : null;

  const actions = {
    free: `<div class="grid-2">
        <button class="btn-secondary" data-act="redo">Refaire</button>
        <button class="btn-secondary" data-act="redo">Ignorer</button>
      </div>
      <button class="btn-primary" data-act="validate">VALIDER</button>`,
    session: `<div class="grid-2">
        <button class="btn-secondary" data-act="redo">Refaire</button>
        <button class="btn-secondary" data-act="next" ${nextShooter ? '' : 'disabled'}>
          Tireur suivant${nextShooter ? `<small>${esc(nextShooter.name)}</small>` : ''}</button>
      </div>
      <button class="btn-primary" data-act="validate">VALIDER</button>`,
    edit: `<button class="btn-danger" data-act="delete">Supprimer la série</button>
      <button class="btn-primary" data-act="save">ENREGISTRER</button>`,
  }[mode];

  root.innerHTML = `
  <div class="screen">
    ${mode === 'edit' ? topbar('Session') : ''}
    <div class="who">${esc(view.who)} · ${esc(view.name)}</div>
    ${mode === 'edit' ? `<div class="muted">Série du ${new Date(stored.createdAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</div>` : ''}
    <div id="summary"></div>
    <div class="grid-2" id="tiles"></div>
    <div class="section-head"><h2 class="h-section" id="shots-title"></h2><span class="muted">Toucher un tir parasite pour le barrer</span></div>
    <div class="list-card shots" id="shots"></div>
    <div class="spacer"></div>
    ${actions}
  </div>`;

  let st;
  function draw() {
    st = computeStats(view.shots, { expected: view.expected, par: view.par });
    const cls = st.parOk === true ? 'ok' : st.parOk === false ? 'ko' : 'neutral';
    $('#summary', root).innerHTML = `
      <div class="result-card ${cls}">
        <div class="result-main">
          <span class="eyebrow">Temps total</span>
          <span class="result-time">${st.total == null ? '–' : fmt(st.total)}</span>
        </div>
        <div class="result-par">
          ${st.parOk === true ? '<strong>PAR RÉUSSI</strong>' : st.parOk === false ? '<strong>PAR RATÉ</strong>' : '<strong>SANS PAR</strong>'}
          ${view.par && st.parDiff != null ? `<span>${fmtSigned(st.parDiff)} s / ${fmt(view.par)} s</span>` : ''}
        </div>
      </div>
      ${st.countMismatch ? `<div class="warn">${st.count} tir${st.count > 1 ? 's' : ''} compté${st.count > 1 ? 's' : ''} pour ${view.expected} attendu${view.expected > 1 ? 's' : ''}</div>` : ''}`;
    $('#tiles', root).innerHTML = `
      <div class="tile"><div class="eyebrow">1er tir</div><div class="tile-val">${fmt(st.first)} s</div></div>
      <div class="tile"><div class="eyebrow">Split moyen</div><div class="tile-val">${st.avgSplit == null ? '–' : fmt(st.avgSplit) + ' s'}</div></div>`;
    $('#shots-title', root).textContent = `TIRS DÉTECTÉS (${view.shots.length})`;
    const rows = shotRows(view.shots);
    $('#shots', root).innerHTML = rows.length ? rows.map((r) => `
      <button class="shot-row ${r.shot.parasite ? 'struck' : ''}" data-t="${r.shot.t}"
        aria-label="${r.shot.parasite ? 'Rétablir' : 'Barrer'} ce tir">
        <span class="shot-name">${r.shot.parasite ? 'Parasite' : 'Tir ' + r.index}${r.shot.simulated ? ' · simulé' : ''}</span>
        <span class="shot-abs">${fmt(r.shot.t)} s</span>
        <span class="shot-split">${r.index === 1 ? '' : '+' + fmt(r.split)}</span>
        <span class="shot-act" aria-hidden="true">${r.shot.parasite ? '↺' : '✕'}</span>
      </button>`).join('')
      : '<div class="empty">Aucun tir détecté. Vérifiez le seuil dans Réglages.</div>';
  }
  draw();

  // Série de session → enregistrement en base.
  const persist = () => saveString({
    ...(stored || {
      sessionId: ctx.sessionId,
      shooterId: ctx.shooter.id,
      exerciseId: ctx.exercise.id,
      shooterName: ctx.shooter.name,
      exerciseName: ctx.exercise.name,
      expected: view.expected,
      par: view.par,
    }),
    shots: view.shots,
    total: st.total,
    parOk: st.parOk,
    validated: true,
  });

  let busy = false;
  root.addEventListener('click', async (e) => {
    const row = e.target.closest('.shot-row');
    if (row) {
      const shot = view.shots.find((s) => String(s.t) === row.dataset.t);
      if (shot) { shot.parasite = !shot.parasite; draw(); }
      return;
    }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act || busy) return;
    busy = true;
    try {
      if (act === 'back') history.back();
      if (act === 'redo') {
        appState.lastRun = null;
        history.back();                       // retour à « Exercice prêt »
      }
      if (act === 'validate' && mode === 'free') {
        appState.freeHistory.push({
          label: `${view.expected} tir${view.expected > 1 ? 's' : ''}${view.par ? ' · par ' + fmt(view.par) : ''}`,
          total: st.total, parOk: st.parOk, shots: view.shots,
        });
        ctx.stringNo += 1;
        appState.lastRun = null;
        toast('Série validée');
        history.back();
      }
      if (act === 'validate' && mode === 'session') {
        await persist();
        appState.lastRun = null;
        toast('Série enregistrée');
        history.go(-2);                       // retour à la session
      }
      if (act === 'next' && nextShooter) {
        await persist();
        appState.lastRun = null;
        const strings = await listStrings(ctx.sessionId);
        ctx.shooter = nextShooter;
        ctx.stringNo = strings.filter((s) =>
          s.shooterId === nextShooter.id && s.exerciseId === ctx.exercise.id).length + 1;
        appState.selShooter[ctx.sessionId] = nextShooter.id;
        toast(`Série enregistrée — au tour de ${nextShooter.name}`);
        history.back();                       // « Exercice prêt » pour le tireur suivant
      }
      if (act === 'save') {
        await persist();
        toast('Série corrigée');
        history.back();
      }
      if (act === 'delete' && confirm('Supprimer cette série ?')) {
        await deleteString(stored.id);
        toast('Série supprimée');
        history.back();
      }
    } catch (err) {
      toast('Erreur d\'enregistrement : ' + err.message);
    } finally {
      busy = false;
    }
  });
}

// Écran 8b — Exercices : liste + fiche (nom, tirs, par, délai fixe/aléatoire, note).

import { go } from '../router.js';
import { appState, freeContext } from '../state.js';
import { getSettings } from '../settings.js';
import { listExercises, getExercise, saveExercise, deleteExercise } from '../db/repo.js';
import { $, esc, fmt, toast, topbar, stepperHTML, delayLabel } from '../ui.js';

export function exerciseSummary(ex) {
  return [
    `${ex.shots} tir${ex.shots > 1 ? 's' : ''}`,
    ex.par ? `par ${fmt(ex.par)} s` : 'sans par',
    delayLabel(ex.delay).toLowerCase(),
  ].join(' · ');
}

export async function renderExercises(root) {
  const list = await listExercises();
  root.innerHTML = `
  <div class="screen">
    ${topbar('Accueil')}
    <div class="section-head"><h1 class="h-display">EXERCICES</h1><span class="muted">${list.length}</span></div>
    <button class="btn-primary" data-act="new">+ NOUVEL EXERCICE</button>
    ${list.length ? `<div class="list-card">${list.map((ex) => `
      <button class="list-row two-line" data-id="${ex.id}">
        <span><span class="row-title">${esc(ex.name)}</span><small>${esc(exerciseSummary(ex))}</small></span>
        <span class="chev">›</span>
      </button>`).join('')}</div>`
    : '<div class="empty-card">Aucun exercice. Créez vos exercices types ; vous composerez ensuite le programme de chaque session.</div>'}
  </div>`;

  root.addEventListener('click', (e) => {
    const row = e.target.closest('[data-id]');
    if (row) return go('exercise', { id: row.dataset.id });
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'back') go('home');
    if (act === 'new') go('exercise');
  });
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export async function renderExerciseEdit(root, { id }) {
  const stored = id ? await getExercise(id) : null;
  if (id && !stored) { go('exercises'); return; }
  const s = getSettings();
  // Copie de travail ; rien n'est écrit avant « Enregistrer ».
  const ex = stored ? structuredClone(stored) : {
    name: '', shots: 2, par: null, note: '',
    delay: { mode: 'random', min: s.delayMin, max: s.delayMax },
  };

  root.innerHTML = `
  <div class="screen">
    ${topbar('Exercices')}
    <h1 class="h-display">${stored ? 'MODIFIER L\'EXERCICE' : 'NOUVEL EXERCICE'}</h1>
    <form class="panel" id="form" autocomplete="off">
      <label class="field">
        <span class="field-label">Nom</span>
        <input class="input" name="name" required maxlength="40" value="${esc(ex.name)}" enterkeyhint="done">
      </label>
      ${stepperHTML('shots', 'Tirs attendus', ex.shots)}
      ${stepperHTML('par', 'Par time', '')}
    </form>
    <section class="panel">
      <div class="field-label">Délai de départ</div>
      <div class="segmented" role="group" aria-label="Type de délai">
        <button type="button" data-mode="random">Aléatoire</button>
        <button type="button" data-mode="fixed">Fixe</button>
      </div>
      <div id="delay-steppers"></div>
    </section>
    <section class="panel">
      <label class="field">
        <span class="field-label">Note <small>(consignes, position, cibles…)</small></span>
        <textarea class="input textarea" name="note" form="form" rows="3" maxlength="500">${esc(ex.note)}</textarea>
      </label>
    </section>
    <button class="btn-secondary" data-act="test">Tester cet exercice (tir libre)</button>
    ${stored ? '<button class="btn-danger" data-act="delete">Supprimer cet exercice</button>' : ''}
    <button class="btn-primary" data-act="save">ENREGISTRER</button>
  </div>`;

  const form = $('#form', root);
  if (!stored) setTimeout(() => form.name.focus(), 50);

  function draw() {
    $('[data-val="shots"]', root).textContent = ex.shots;
    $('[data-val="par"]', root).textContent = ex.par ? fmt(ex.par) + ' s' : 'aucun';
    root.querySelectorAll('[data-mode]').forEach((b) =>
      b.classList.toggle('on', b.dataset.mode === ex.delay.mode));
    const fixed = ex.delay.mode === 'fixed';
    $('#delay-steppers', root).innerHTML = fixed
      ? stepperHTML('min', 'Délai', fmt(ex.delay.min, 1) + ' s')
      : stepperHTML('min', 'Minimum', fmt(ex.delay.min, 1) + ' s') +
        stepperHTML('max', 'Maximum', fmt(ex.delay.max, 1) + ' s');
  }
  draw();

  function step(key, dir) {
    if (key === 'shots') ex.shots = clamp(ex.shots + dir, 1, 30);
    if (key === 'par') {
      const p = (ex.par || 0) + dir * 0.25;
      ex.par = p < 0.5 ? (dir > 0 ? 0.5 : null) : +clamp(p, 0.5, 120).toFixed(2);
    }
    if (key === 'min') {
      ex.delay.min = clamp(ex.delay.min + dir * 0.5, 0, 10);
      if (ex.delay.max < ex.delay.min) ex.delay.max = ex.delay.min;
    }
    if (key === 'max') {
      ex.delay.max = clamp(ex.delay.max + dir * 0.5, 0, 10);
      if (ex.delay.min > ex.delay.max) ex.delay.min = ex.delay.max;
    }
    draw();
  }

  const collect = () => ({
    ...ex,
    name: form.name.value,
    note: root.querySelector('[name="note"]').value,
    delay: { ...ex.delay, max: ex.delay.mode === 'fixed' ? ex.delay.min : ex.delay.max },
  });

  const save = async () => {
    try {
      await saveExercise(collect());
      toast(stored ? 'Exercice modifié' : 'Exercice ajouté');
      history.back();
    } catch (err) {
      toast(err.message);
      form.name.focus();
    }
  };

  form.addEventListener('submit', (e) => { e.preventDefault(); save(); });
  root.addEventListener('click', async (e) => {
    const st = e.target.closest('[data-step]');
    if (st) { const [k, d] = st.dataset.step.split(':'); return step(k, +d); }
    const mode = e.target.closest('[data-mode]');
    if (mode) { ex.delay.mode = mode.dataset.mode; return draw(); }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'back') history.back();
    if (act === 'save') save();
    if (act === 'test') {
      const data = collect();
      const ctx = freeContext();
      ctx.exercise = { id: null, name: data.name.trim() || 'Exercice', shots: data.shots, par: data.par, delay: data.delay };
      appState.context = ctx;
      go('ready');
    }
    if (act === 'delete' && confirm(`Supprimer l'exercice « ${stored.name} » ?`)) {
      const r = await deleteExercise(stored);
      toast(r === 'archived' ? 'Exercice archivé (ses séries sont conservées)' : 'Exercice supprimé');
      history.back();
    }
  });
}

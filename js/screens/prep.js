// Écran 2 — Préparation de session : date, lieu, tireurs cochés, programme d'exercices.
// Le brouillon survit à un aller-retour vers « Nouvel exercice ».

import { go, replace } from '../router.js';
import { appState } from '../state.js';
import { listShooters, listExercises, getSession, saveSession, saveShooter, deleteSession } from '../db/repo.js';
import { isoDay } from '../share.js';
import { $, esc, toast, topbar } from '../ui.js';
import { exerciseSummary } from './exercises.js';

export async function renderPrep(root, { id }) {
  const stored = id ? await getSession(id) : null;
  if (id && !stored) { go('home'); return; }
  const key = id || 'new';
  if (!appState.prepDraft || appState.prepDraft.key !== key) {
    appState.prepDraft = {
      key,
      data: stored ? structuredClone(stored) : {
        date: isoDay(), place: appState.lastPlace || '', comment: '', shooterIds: [], exerciseIds: [],
      },
    };
  }
  const draft = appState.prepDraft;
  const d = draft.data;
  const [shooters, exercises] = await Promise.all([listShooters(), listExercises()]);
  // Un exercice créé via « + Nouvel exercice » est ajouté d'office au programme.
  if (draft.knownEx) {
    for (const ex of exercises) if (!draft.knownEx.includes(ex.id)) d.exerciseIds.push(ex.id);
  }
  draft.knownEx = exercises.map((ex) => ex.id);

  root.innerHTML = `
  <div class="screen">
    ${topbar(stored ? 'Retour' : 'Accueil')}
    <h1 class="h-display">${stored ? 'MODIFIER LA SESSION' : 'NOUVELLE SESSION'}</h1>
    <div class="grid-2">
      <label class="field"><span class="field-label">Date</span>
        <input class="input" type="date" name="date" value="${esc(d.date)}"></label>
      <label class="field"><span class="field-label">Lieu</span>
        <input class="input" name="place" maxlength="40" value="${esc(d.place)}" placeholder="Stand" autocapitalize="words"></label>
    </div>

    <section class="block">
      <div class="section-head"><h2 class="h-section">TIREURS</h2><span class="muted" id="n-shooters"></span></div>
      <div class="list-card" id="shooters"></div>
      <div class="quick-add">
        <input class="input" id="new-shooter" maxlength="40" placeholder="Ajouter un tireur…" autocapitalize="words" enterkeyhint="done">
        <button class="btn-secondary" data-act="add-shooter">Ajouter</button>
      </div>
    </section>

    <section class="block">
      <div class="section-head"><h2 class="h-section">PROGRAMME</h2><span class="muted">Devient les favoris de la session</span></div>
      <div class="ex-picks" id="exercises"></div>
      <button class="btn-secondary" data-act="new-ex">+ Nouvel exercice</button>
    </section>

    <label class="field"><span class="field-label">Commentaire <small>(facultatif)</small></span>
      <textarea class="input textarea" name="comment" rows="2" maxlength="500">${esc(d.comment)}</textarea></label>

    <div class="spacer"></div>
    ${stored ? '<button class="btn-danger" data-act="delete">Supprimer la session</button>' : ''}
    <button class="btn-secondary" data-act="save-start">Enregistrer et commencer</button>
    <button class="btn-primary" data-act="save">ENREGISTRER LA SESSION</button>
  </div>`;

  function drawShooters() {
    const box = $('#shooters', root);
    box.innerHTML = shooters.length ? shooters.map((s) => `
      <label class="check-row">
        <input type="checkbox" data-shooter="${s.id}" ${d.shooterIds.includes(s.id) ? 'checked' : ''}>
        <span>${esc(s.name)}</span>${s.group ? `<small>${esc(s.group)}</small>` : ''}
      </label>`).join('')
      : '<div class="empty">Aucun tireur enregistré : ajoutez-en ci-dessous.</div>';
    $('#n-shooters', root).textContent = `${d.shooterIds.length} sélectionné${d.shooterIds.length > 1 ? 's' : ''}`;
  }

  function drawExercises() {
    $('#exercises', root).innerHTML = exercises.map((ex) => {
      const pos = d.exerciseIds.indexOf(ex.id);
      return `<button type="button" class="ex-pick ${pos >= 0 ? 'on' : ''}" data-ex="${ex.id}" aria-pressed="${pos >= 0}">
        <span class="ex-pick-pos">${pos >= 0 ? pos + 1 : ''}</span>
        <span><strong>${esc(ex.name)}</strong><small>${esc(exerciseSummary(ex))}</small></span>
      </button>`;
    }).join('') || '<div class="empty-card">Aucun exercice : créez-en un.</div>';
  }

  drawShooters();
  drawExercises();

  root.addEventListener('input', (e) => {
    const n = e.target.name;
    if (n === 'date' || n === 'place' || n === 'comment') d[n] = e.target.value;
  });

  root.addEventListener('change', (e) => {
    const sid = e.target.dataset.shooter;
    if (!sid) return;
    d.shooterIds = e.target.checked
      ? [...d.shooterIds, sid]
      : d.shooterIds.filter((x) => x !== sid);
    // Ordre de passage = ordre de la liste des tireurs.
    const order = shooters.map((s) => s.id);
    d.shooterIds.sort((a, b) => order.indexOf(a) - order.indexOf(b));
    drawShooters();
  });

  async function addShooter() {
    const input = $('#new-shooter', root);
    if (!input.value.trim()) return input.focus();
    const s = await saveShooter({ name: input.value });
    shooters.push(s);
    shooters.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    d.shooterIds.push(s.id);
    input.value = '';
    drawShooters();
  }
  $('#new-shooter', root).addEventListener('keydown', (e) => { if (e.key === 'Enter') addShooter(); });

  async function save(start) {
    try {
      const status = start && (!stored || stored.status === 'prepared') ? 'running' : (stored?.status || 'prepared');
      const s = await saveSession({ ...d, status });
      appState.prepDraft = null;
      appState.lastPlace = s.place;
      toast(stored ? 'Session modifiée' : 'Session enregistrée');
      if (start) replace('session', { id: s.id });
      else history.back();
    } catch (err) {
      toast(err.message);
    }
  }

  root.addEventListener('click', async (e) => {
    const ex = e.target.closest('[data-ex]');
    if (ex) {
      const exId = ex.dataset.ex;
      d.exerciseIds = d.exerciseIds.includes(exId)
        ? d.exerciseIds.filter((x) => x !== exId)
        : [...d.exerciseIds, exId];
      return drawExercises();
    }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'back') { appState.prepDraft = null; history.back(); }
    if (act === 'add-shooter') addShooter();
    if (act === 'new-ex') go('exercise');
    if (act === 'save') save(false);
    if (act === 'save-start') save(true);
    if (act === 'delete' && confirm('Supprimer cette session et toutes ses séries ?')) {
      await deleteSession(stored);
      appState.prepDraft = null;
      toast('Session supprimée');
      go('home');
    }
  });
}

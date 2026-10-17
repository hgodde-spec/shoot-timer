// Écran 8a — Tireurs : liste groupée + fiche (création, modification, suppression).

import { go } from '../router.js';
import { listShooters, getShooter, saveShooter, deleteShooter, listGroups } from '../db/repo.js';
import { $, esc, toast, topbar } from '../ui.js';

const NO_GROUP = 'Sans groupe';

export async function renderShooters(root) {
  const shooters = await listShooters();
  const groups = new Map();
  for (const s of shooters) {
    const g = s.group || NO_GROUP;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(s);
  }
  // « Sans groupe » en dernier.
  const names = [...groups.keys()].sort((a, b) =>
    (a === NO_GROUP) - (b === NO_GROUP) || a.localeCompare(b, 'fr'));

  root.innerHTML = `
  <div class="screen">
    ${topbar('Accueil')}
    <div class="section-head"><h1 class="h-display">TIREURS</h1><span class="muted">${shooters.length}</span></div>
    <button class="btn-primary" data-act="new">+ NOUVEAU TIREUR</button>
    ${shooters.length ? names.map((g) => `
      <section class="group">
        <div class="eyebrow">${esc(g)}</div>
        <div class="list-card">
          ${groups.get(g).map((s) => `
            <button class="list-row" data-id="${s.id}"><span>${esc(s.name)}</span><span class="chev">›</span></button>`).join('')}
        </div>
      </section>`).join('')
    : '<div class="empty-card">Aucun tireur. Ajoutez les participants de vos cours ; vous les cocherez ensuite en préparant chaque session.</div>'}
  </div>`;

  root.addEventListener('click', (e) => {
    const row = e.target.closest('[data-id]');
    if (row) return go('shooter', { id: row.dataset.id });
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'back') go('home');
    if (act === 'new') go('shooter');
  });
}

export async function renderShooterEdit(root, { id }) {
  const s = id ? await getShooter(id) : null;
  if (id && !s) { go('shooters'); return; }
  const groups = await listGroups();

  root.innerHTML = `
  <div class="screen">
    ${topbar('Tireurs')}
    <h1 class="h-display">${s ? 'MODIFIER LE TIREUR' : 'NOUVEAU TIREUR'}</h1>
    <form class="panel" id="form" autocomplete="off">
      <label class="field">
        <span class="field-label">Nom</span>
        <input class="input" name="name" required maxlength="40" value="${esc(s?.name)}" autocapitalize="words" enterkeyhint="next">
      </label>
      <label class="field">
        <span class="field-label">Groupe <small>(facultatif)</small></span>
        <input class="input" name="group" maxlength="40" value="${esc(s?.group)}" list="groups" enterkeyhint="done">
        <datalist id="groups">${groups.map((g) => `<option value="${esc(g)}">`).join('')}</datalist>
      </label>
      ${groups.length ? `<div class="pills">${groups.map((g) =>
        `<button type="button" class="pill" data-group="${esc(g)}">${esc(g)}</button>`).join('')}</div>` : ''}
    </form>
    <div class="spacer"></div>
    ${s ? '<button class="btn-danger" data-act="delete">Supprimer ce tireur</button>' : ''}
    <button class="btn-primary" data-act="save">ENREGISTRER</button>
  </div>`;

  const form = $('#form', root);
  if (!s) setTimeout(() => form.name.focus(), 50);

  const save = async () => {
    try {
      await saveShooter({ ...s, name: form.name.value, group: form.group.value });
      toast(s ? 'Tireur modifié' : 'Tireur ajouté');
      history.back();
    } catch (err) {
      toast(err.message);
      form.name.focus();
    }
  };

  form.addEventListener('submit', (e) => { e.preventDefault(); save(); });
  root.addEventListener('click', async (e) => {
    const pill = e.target.closest('[data-group]');
    if (pill) { form.group.value = pill.dataset.group; return; }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'back') history.back();
    if (act === 'save') save();
    if (act === 'delete' && confirm(`Supprimer ${s.name} ?`)) {
      const r = await deleteShooter(s);
      toast(r === 'archived' ? 'Tireur archivé (ses séries sont conservées)' : 'Tireur supprimé');
      history.back();
    }
  });
}

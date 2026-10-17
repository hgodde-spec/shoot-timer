// Accès aux données métier : tireurs, exercices (sessions et séries : étape 3).
// Un tireur ou un exercice déjà utilisé dans des séries n'est pas effacé mais archivé,
// pour que les rapports des sessions passées restent complets.

import * as db from './idb.js';

const SEED_KEY = 'shot-timer.seeded';
const collator = new Intl.Collator('fr', { sensitivity: 'base', numeric: true });
const byName = (a, b) => collator.compare(a.name, b.name);

export const newId = () =>
  (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

// ---- Tireurs ----

export async function listShooters({ archived = false } = {}) {
  const all = await db.getAll('shooters');
  return all.filter((s) => archived || !s.archived).sort(byName);
}

export const getShooter = (id) => db.get('shooters', id);

export async function saveShooter(data) {
  const name = (data.name || '').trim();
  if (!name) throw new Error('Le nom est obligatoire');
  const now = new Date().toISOString();
  return db.put('shooters', {
    id: data.id || newId(),
    name,
    group: (data.group || '').trim(),
    archived: !!data.archived,
    createdAt: data.createdAt || now,
    updatedAt: now,
  });
}

export async function listGroups() {
  const all = await listShooters();
  return [...new Set(all.map((s) => s.group).filter(Boolean))].sort(collator.compare);
}

// ---- Exercices ----

export async function listExercises({ archived = false } = {}) {
  const all = await db.getAll('exercises');
  return all.filter((e) => archived || !e.archived).sort(byName);
}

export const getExercise = (id) => db.get('exercises', id);

export async function saveExercise(data) {
  const name = (data.name || '').trim();
  if (!name) throw new Error('Le nom est obligatoire');
  const shots = Math.max(1, Math.round(+data.shots || 1));
  const par = data.par && +data.par > 0 ? +(+data.par).toFixed(2) : null;
  const mode = data.delay?.mode === 'fixed' ? 'fixed' : 'random';
  let min = Math.max(0, +data.delay?.min || 0);
  let max = mode === 'fixed' ? min : Math.max(min, +data.delay?.max || min);
  const now = new Date().toISOString();
  return db.put('exercises', {
    id: data.id || newId(),
    name,
    shots,
    par,
    delay: { mode, min, max },
    note: (data.note || '').trim(),
    archived: !!data.archived,
    createdAt: data.createdAt || now,
    updatedAt: now,
  });
}

// ---- Sessions ----
// date : « AAAA-MM-JJ » (jour local). status : 'prepared' | 'running' | 'closed'.

export async function listSessions() {
  const all = await db.getAll('sessions');
  return all.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

export const getSession = (id) => db.get('sessions', id);

export async function saveSession(data) {
  if (!data.date) throw new Error('La date est obligatoire');
  if (!data.shooterIds?.length) throw new Error('Cochez au moins un tireur');
  if (!data.exerciseIds?.length) throw new Error('Choisissez au moins un exercice');
  const now = new Date().toISOString();
  return db.put('sessions', {
    id: data.id || newId(),
    date: data.date,
    place: (data.place || '').trim(),
    comment: (data.comment || '').trim(),
    shooterIds: [...data.shooterIds],
    exerciseIds: [...data.exerciseIds],
    status: data.status || 'prepared',
    createdAt: data.createdAt || now,
    updatedAt: now,
  });
}

export async function setSessionStatus(session, status) {
  return db.put('sessions', { ...session, status, updatedAt: new Date().toISOString() });
}

export async function deleteSession(session) {
  for (const s of await listStrings(session.id)) await db.del('strings', s.id);
  await db.del('sessions', session.id);
}

// « Session du jour » : celle en cours, sinon une session préparée pour aujourd'hui,
// sinon la prochaine session préparée.
export async function currentSession(today) {
  const all = await listSessions();
  return all.find((s) => s.status === 'running')
    || all.find((s) => s.status === 'prepared' && s.date === today)
    || all.filter((s) => s.status === 'prepared' && s.date > today).sort((a, b) => a.date.localeCompare(b.date))[0]
    || null;
}

// Tireurs / exercices d'une session, dans l'ordre choisi (archivés compris).
export async function sessionMembers(session) {
  const [shooters, exercises] = await Promise.all([db.getAll('shooters'), db.getAll('exercises')]);
  const sMap = new Map(shooters.map((s) => [s.id, s]));
  const eMap = new Map(exercises.map((e) => [e.id, e]));
  return {
    shooters: session.shooterIds.map((id) => sMap.get(id)).filter(Boolean),
    exercises: session.exerciseIds.map((id) => eMap.get(id)).filter(Boolean),
  };
}

// ---- Séries ----
// shots : [{ t (s depuis le bip), parasite, peak?, simulated? }]
// shooterName / exerciseName / expected / par sont recopiés : le rapport reste juste
// même si l'exercice est modifié ensuite.

export async function listStrings(sessionId) {
  const all = await db.getByIndex('strings', 'sessionId', sessionId);
  return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export const getString = (id) => db.get('strings', id);

export async function saveString(data) {
  return db.put('strings', {
    id: data.id || newId(),
    sessionId: data.sessionId,
    shooterId: data.shooterId,
    exerciseId: data.exerciseId,
    shooterName: data.shooterName,
    exerciseName: data.exerciseName,
    expected: data.expected,
    par: data.par ?? null,
    createdAt: data.createdAt || new Date().toISOString(),
    shots: data.shots.map(({ t, parasite, peak, simulated }) =>
      ({ t, parasite: !!parasite, ...(peak != null && { peak }), ...(simulated && { simulated: true }) })),
    total: data.total ?? null,
    parOk: data.parOk ?? null,
    validated: data.validated !== false,
  });
}

export const deleteString = (id) => db.del('strings', id);

// ---- Suppression (ou archivage si déjà utilisé) ----

async function removeOrArchive(store, index, item) {
  const used = await db.countByIndex('strings', index, item.id);
  if (used > 0) {
    await db.put(store, { ...item, archived: true, updatedAt: new Date().toISOString() });
    return 'archived';
  }
  await db.del(store, item.id);
  return 'deleted';
}

export const deleteShooter = (s) => removeOrArchive('shooters', 'shooterId', s);
export const deleteExercise = (e) => removeOrArchive('exercises', 'exerciseId', e);

// ---- Premier lancement ----

const EXAMPLES = [
  { name: 'Mise en joue', shots: 1, par: 2, note: 'Départ arme basse.' },
  { name: 'Doublé', shots: 2, par: 2.5, note: '' },
  { name: 'Série 5 tirs', shots: 5, par: 6, note: '' },
  { name: 'Changement chargeur', shots: 2, par: 5, note: '1 tir, changement de chargeur, 1 tir.' },
];

export async function seedIfEmpty(defaultDelay) {
  if (localStorage.getItem(SEED_KEY)) return;
  const existing = await db.getAll('exercises');
  if (!existing.length) {
    for (const ex of EXAMPLES) await saveExercise({ ...ex, delay: { mode: 'random', ...defaultDelay } });
  }
  localStorage.setItem(SEED_KEY, '1');
}

// Demande à Safari de ne pas effacer les données (accordé surtout aux apps installées).
export async function requestPersistence() {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch { /* non supporté */ }
  return false;
}

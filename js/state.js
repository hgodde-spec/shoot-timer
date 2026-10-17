// État en mémoire partagé entre écrans (contexte de la série en cours).
// À l'étape 3, `context` sera rempli depuis la session (tireur + exercice en base).

import { getSettings } from './settings.js';

export const appState = {
  // Exercice + tireur de la prochaine série.
  context: null,
  // Dernière série tirée, en attente de validation.
  lastRun: null,
  // Séries validées en mode libre (non persistées à l'étape 1).
  freeHistory: [],
};

export function freeContext({ shots = 2, par = null } = {}) {
  const s = getSettings();
  return {
    mode: 'free',
    shooter: { id: null, name: 'Tir libre' },
    exercise: {
      id: null,
      name: 'Exercice libre',
      shots,
      par,
      delay: { mode: 'random', min: s.delayMin, max: s.delayMax },
    },
    stringNo: appState.freeHistory.length + 1,
  };
}

// Synthèse d'une session : utilisée par l'écran Rapport et par l'export Excel.
// Comparer des temps n'a de sens qu'au sein d'un même exercice : les statistiques sont
// donc calculées par couple (tireur, exercice), puis agrégées pour les en-têtes.

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

// Statistiques d'un lot de séries.
export function statsOf(strings) {
  const totals = strings.map((s) => s.total).filter((t) => t != null);
  const withPar = strings.filter((s) => s.parOk != null);
  const parOk = withPar.filter((s) => s.parOk).length;
  return {
    count: strings.length,
    best: totals.length ? Math.min(...totals) : null,
    avg: mean(totals),
    parOk,
    parCount: withPar.length,
    parRate: withPar.length ? parOk / withPar.length : null,
  };
}

// shooters / exercises : dans l'ordre de la session ; strings : séries validées.
// Les tireurs ou exercices retirés du programme mais ayant des séries sont ajoutés à la fin
// (avec le nom recopié dans la série).
export function buildSummary(session, shooters, exercises, allStrings) {
  const strings = allStrings.filter((s) => s.validated !== false);
  const shooterList = [...shooters];
  const exerciseList = [...exercises];
  for (const s of strings) {
    if (!shooterList.some((x) => x.id === s.shooterId)) shooterList.push({ id: s.shooterId, name: s.shooterName });
    if (!exerciseList.some((x) => x.id === s.exerciseId)) {
      exerciseList.push({ id: s.exerciseId, name: s.exerciseName, shots: s.expected, par: s.par });
    }
  }

  const cell = (shId, exId) => statsOf(strings.filter((s) => s.shooterId === shId && s.exerciseId === exId));

  const byShooter = shooterList.map((sh) => {
    const own = strings.filter((s) => s.shooterId === sh.id);
    return {
      shooter: sh,
      ...statsOf(own),
      rows: exerciseList
        .map((ex) => ({ exercise: ex, ...cell(sh.id, ex.id) }))
        .filter((r) => r.count > 0),
    };
  });

  const byExercise = exerciseList.map((ex) => {
    const own = strings.filter((s) => s.exerciseId === ex.id);
    return {
      exercise: ex,
      ...statsOf(own),
      rows: shooterList
        .map((sh) => ({ shooter: sh, ...cell(sh.id, ex.id) }))
        .filter((r) => r.count > 0)
        .sort((a, b) => (a.best ?? Infinity) - (b.best ?? Infinity)),   // classement au meilleur temps
    };
  });

  return {
    session,
    strings,
    overall: statsOf(strings),
    nShooters: byShooter.filter((r) => r.count > 0).length,
    byShooter,
    byExercise,
  };
}

export const pct = (rate) => (rate == null ? '–' : Math.round(rate * 100) + ' %');

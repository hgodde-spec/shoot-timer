// Statistiques d'une série. Les tirs sont des temps absolus depuis le bip (s).

export function computeStats(shots, { expected = null, par = null } = {}) {
  const valid = shots.filter((s) => !s.parasite).map((s) => s.t).sort((a, b) => a - b);
  const splits = valid.map((t, i) => (i === 0 ? t : t - valid[i - 1]));
  const total = valid.length ? valid[valid.length - 1] : null;
  const first = valid.length ? valid[0] : null;
  const later = splits.slice(1);
  const avgSplit = later.length ? later.reduce((a, b) => a + b, 0) / later.length : null;
  const countOk = expected == null || valid.length >= expected;
  let parOk = null;
  if (par != null && par > 0) parOk = total != null && countOk && total <= par;
  return {
    count: valid.length,
    total, first, avgSplit, splits,
    parOk,
    parDiff: par != null && total != null ? total - par : null,
    countMismatch: expected != null && valid.length !== expected,
  };
}

// Splits ligne à ligne en tenant compte des tirs barrés (pour la liste du résultat).
export function shotRows(shots) {
  const sorted = [...shots].sort((a, b) => a.t - b.t);
  let prev = null;
  let n = 0;
  return sorted.map((s) => {
    const row = { shot: s, index: null, split: null };
    if (!s.parasite) {
      n += 1;
      row.index = n;
      row.split = prev == null ? s.t : s.t - prev;
      prev = s.t;
    } else {
      row.split = prev == null ? s.t : s.t - prev;
    }
    return row;
  });
}

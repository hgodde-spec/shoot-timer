// Export Excel d'une session : onglet « Synthèse » (par tireur, par exercice)
// et onglet « Détail » (une ligne par tir). SheetJS est chargé à la demande.

import { buildSummary } from '../report/summary.js';
import { getSession, sessionMembers, listStrings } from '../db/repo.js';
import { fileSlug, deliverFile } from '../share.js';
import { fmtDayLong } from '../ui.js';

const LIB_URL = new URL('../vendor/xlsx.mini.min.js', import.meta.url);
let libPromise = null;

// Précharger dès l'ouverture du rapport : le partage iOS exige que le fichier soit prêt
// rapidement après le toucher sur « Exporter ».
export function loadXLSX() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  libPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = LIB_URL.href;
    s.onload = () => resolve(window.XLSX);
    s.onerror = () => { libPromise = null; reject(new Error('Bibliothèque Excel introuvable')); };
    document.head.appendChild(s);
  });
  return libPromise;
}

const N2 = '0.00';
const PCT = '0%';
const r2 = (v) => (v == null ? null : Math.round(v * 1000) / 1000);

// Cellules typées : nombre avec format, ou texte.
function num(v, z = N2) { return v == null ? { t: 's', v: '' } : { t: 'n', v, z }; }
function txt(v) { return { t: 's', v: v ?? '' }; }

function sheetFrom(XLSX, rows, widths) {
  const ws = XLSX.utils.aoa_to_sheet(rows.map((r) => r.map((c) =>
    (c && typeof c === 'object' && 't' in c ? c.v : c))));
  // Réapplique types et formats (aoa_to_sheet ne garde que les valeurs).
  rows.forEach((r, y) => r.forEach((c, x) => {
    const ref = XLSX.utils.encode_cell({ r: y, c: x });
    const typed = c && typeof c === 'object' && 't' in c;
    const v = typed ? c.v : c;
    if (v === '' || v == null) { delete ws[ref]; return; }      // pas de cellules vides
    if (typed) ws[ref] = { t: c.t, v: c.v, ...(c.z && { z: c.z }) };
  }));
  ws['!cols'] = widths.map((w) => ({ wch: w }));
  return ws;
}

export function buildWorkbook(XLSX, sum) {
  const { session } = sum;

  // ---- Synthèse ----
  const syn = [
    ['Session de tir', fmtDayLong(session.date)],
    ['Lieu', session.place],
    ...(session.comment ? [['Commentaire', session.comment]] : []),
    ['Tireurs', sum.nShooters],
    ['Séries', sum.overall.count],
    ['Par réussi', num(sum.overall.parRate, PCT)],
    [],
    ['PAR TIREUR'],
    ['Tireur', 'Exercice', 'Séries', 'Meilleur (s)', 'Moyenne (s)', 'Par réussis', 'Par tentés', 'Taux par'],
  ];
  for (const g of sum.byShooter.filter((x) => x.count)) {
    for (const r of g.rows) {
      syn.push([txt(g.shooter.name), txt(r.exercise.name), r.count, num(r2(r.best)), num(r2(r.avg)),
        r.parCount ? r.parOk : '', r.parCount || '', num(r.parRate, PCT)]);
    }
    syn.push([txt(g.shooter.name), txt('Total'), g.count, '', '',
      g.parCount ? g.parOk : '', g.parCount || '', num(g.parRate, PCT)]);
  }
  syn.push([], ['PAR EXERCICE'],
    ['Exercice', 'Tirs', 'Par (s)', 'Rang', 'Tireur', 'Séries', 'Meilleur (s)', 'Moyenne (s)', 'Par réussis', 'Par tentés', 'Taux par']);
  for (const g of sum.byExercise.filter((x) => x.count)) {
    g.rows.forEach((r, i) => {
      syn.push([txt(g.exercise.name), g.exercise.shots ?? '', num(g.exercise.par), i + 1, txt(r.shooter.name),
        r.count, num(r2(r.best)), num(r2(r.avg)), r.parCount ? r.parOk : '', r.parCount || '', num(r.parRate, PCT)]);
    });
  }

  // ---- Détail : une ligne par tir ----
  const det = [['Tireur', 'Exercice', 'N° de série', 'N° de tir', 'Temps absolu (s)', 'Split (s)', 'Parasite',
    'Heure', 'Par (s)', 'Temps série (s)', 'Résultat par']];
  const serieNo = new Map();
  for (const s of sum.strings) {
    const key = s.shooterId + '|' + s.exerciseId;
    const no = (serieNo.get(key) || 0) + 1;
    serieNo.set(key, no);
    const hour = new Date(s.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const res = s.parOk === true ? 'réussi' : s.parOk === false ? 'raté' : '';
    const common = (shotNo, t, split, parasite) => [txt(s.shooterName), txt(s.exerciseName), no, shotNo,
      num(r2(t), '0.000'), num(r2(split), '0.000'), parasite, hour, num(s.par), num(r2(s.total)), res];
    const shots = [...s.shots].sort((a, b) => a.t - b.t);
    if (!shots.length) { det.push(common('', null, null, '')); continue; }
    let prev = null;
    let n = 0;
    for (const sh of shots) {
      const split = prev == null ? sh.t : sh.t - prev;
      if (!sh.parasite) { n += 1; prev = sh.t; }
      det.push(common(sh.parasite ? '' : n, sh.t, split, sh.parasite ? 'oui' : 'non'));
    }
  }

  const wb = XLSX.utils.book_new();
  const wsSyn = sheetFrom(XLSX, syn, [18, 22, 10, 12, 12, 11, 11, 12, 11, 11, 10]);
  const wsDet = sheetFrom(XLSX, det, [18, 22, 11, 10, 15, 10, 9, 8, 9, 14, 12]);
  wsDet['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: det.length - 1, c: 10 } }) };
  XLSX.utils.book_append_sheet(wb, wsSyn, 'Synthèse');
  XLSX.utils.book_append_sheet(wb, wsDet, 'Détail');
  wb.Props = { Title: `Session ${session.date} ${session.place}`.trim(), Author: 'Shot Timer' };
  return wb;
}

export function exportFilename(session) {
  const place = fileSlug(session.place);
  return `shot-timer_${session.date}${place ? '_' + place : ''}.xlsx`;
}

// Construit le fichier puis le remet (partage iOS ou téléchargement).
export async function exportSessionXlsx(sessionId) {
  const [XLSX, session] = await Promise.all([loadXLSX(), getSession(sessionId)]);
  const [{ shooters, exercises }, strings] = await Promise.all([sessionMembers(session), listStrings(sessionId)]);
  const sum = buildSummary(session, shooters, exercises, strings);
  const wb = buildWorkbook(XLSX, sum);
  const data = XLSX.write(wb, { bookType: 'xlsx', type: 'array', compression: true });
  const blob = new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  return deliverFile(blob, exportFilename(session), `Session ${fmtDayLong(session.date)}`);
}

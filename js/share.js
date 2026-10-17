// Remise d'un fichier à l'utilisateur.
// Sur iPhone/iPad, le téléchargement d'un Blob est peu fiable dans une app installée :
// on passe par la feuille de partage (« Enregistrer dans Fichiers », AirDrop, Mail…).
// Safari exige que navigator.share() suive de près un toucher : si le fichier a mis trop
// de temps à se préparer, on affiche un bouton « Partager » pour un nouveau toucher.
// Sur ordinateur, téléchargement classique.

const isTouch = () => navigator.maxTouchPoints > 0 || 'ontouchstart' in window;

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return 'downloaded';
}

// Feuille modale avec un gros bouton : le toucher redonne l'autorisation de partager.
function askForTap(file, title) {
  return new Promise((resolve) => {
    const sheet = document.createElement('div');
    sheet.className = 'share-sheet';
    sheet.innerHTML = `<div class="share-box" role="dialog" aria-label="Fichier prêt">
      <strong>Fichier prêt</strong><span>${file.name.replace(/[<>&]/g, '')}</span>
      <button class="btn-primary" data-a="share">PARTAGER LE FICHIER</button>
      <button class="btn-secondary" data-a="cancel">Annuler</button></div>`;
    document.body.appendChild(sheet);
    sheet.addEventListener('click', async (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (!a) return;
      sheet.remove();
      if (a === 'cancel') return resolve('cancelled');
      try {
        await navigator.share({ files: [file], title });
        resolve('shared');
      } catch (err) {
        resolve(err && err.name === 'AbortError' ? 'cancelled' : download(file, file.name));
      }
    });
  });
}

export async function deliverFile(blob, filename, title = filename) {
  const file = new File([blob], filename, { type: blob.type });
  if (isTouch() && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return 'shared';
    } catch (err) {
      if (err && err.name === 'AbortError') return 'cancelled';
      if (err && err.name === 'NotAllowedError') return askForTap(file, title);
      // Autre échec : on tente le téléchargement.
    }
  }
  return download(blob, filename);
}

// Partie de nom de fichier sûre : « Stand de Rueil » → « Stand-de-Rueil ».
export function fileSlug(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '')
    .slice(0, 40);
}

export function isoDay(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

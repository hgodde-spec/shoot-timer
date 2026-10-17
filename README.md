# Shot Timer

Chronomètre de tir (PWA) pour les cours au stand : bip de départ, détection des tirs au micro,
séries par tireur et par exercice, rapport et export Excel. Voir `ARCHITECTURE.md`.

## État d'avancement

| Étape | Contenu | État |
|---|---|---|
| 1 | Moteur audio, écrans Prêt / Tir en cours / Résultat / Réglages, exercice libre, mode simulation | ✅ |
| 2 | IndexedDB, tireurs, exercices, sauvegarde/restauration JSON | ✅ |
| 3 | Préparation de session, session en cours, enchaînement des tireurs, correction d'une série | ✅ |
| 4 | Rapport de fin de session (par tireur / par exercice, clôture) | ✅ |
| 5 | Export Excel (SheetJS) + partage iOS | ✅ |

## Export Excel

Rapport de session › **Exporter Excel** produit `shot-timer_AAAA-MM-JJ_Lieu.xlsx` :
- **Synthèse** : en-tête de session, tableau *par tireur* (une ligne par exercice + total),
  tableau *par exercice* (tireurs classés au meilleur temps).
- **Détail** : une ligne par tir (tireur, exercice, n° de série, n° de tir, temps absolu, split,
  parasite oui/non, heure, par, temps de la série, résultat), avec filtres automatiques.

Sur iPhone le fichier passe par le menu de partage : choisir **Enregistrer dans Fichiers**,
Mail, AirDrop… Si iOS refuse le partage parce que la préparation a été trop longue, l'app
affiche « Fichier prêt » : un toucher sur **Partager le fichier** relance le partage.
Sur ordinateur, le fichier est téléchargé.

SheetJS Community Edition 0.20.3 (licence Apache 2.0) est inclus dans `js/vendor/`.

## Tester sur l'ordinateur

```
python -m http.server 8765 --directory shot-timer
```

Ouvrir http://localhost:8765 (localhost est un contexte sécurisé : le micro fonctionne).
Dans **Réglages › Test**, activer **Mode simulation** pour avoir un bouton « Tir simulé ».

## Déployer sur GitHub Pages

1. Créer un compte sur github.com, puis un dépôt **public** (ex. `shot-timer`).
2. Envoyer les fichiers : sur la page du dépôt, **Add file › Upload files**, glisser **le contenu**
   du dossier `shot-timer/` (index.html doit être à la racine du dépôt), puis **Commit changes**.
   (Ou GitHub Desktop si vous préférez.)
3. **Settings › Pages** : Source = *Deploy from a branch*, Branch = `main`, dossier `/ (root)`, **Save**.
4. Après 1 à 2 minutes l'app est en ligne sur `https://<votre-compte>.github.io/shot-timer/`
   (HTTPS fourni automatiquement, indispensable pour le micro).

**Mises à jour** : ré-uploader les fichiers modifiés. L'app installée affiche la nouvelle version
au lancement suivant (ouvrir, fermer, rouvrir). Si on ajoute un fichier JS, l'ajouter aussi à la
liste `FILES` de `sw.js` et incrémenter `VERSION`.

## Installer sur l'iPhone

1. Ouvrir l'adresse dans **Safari** (pas Chrome : seul Safari permet l'installation sur iOS 17).
2. Bouton **Partager** › **Sur l'écran d'accueil** › **Ajouter**.
3. Lancer l'app depuis l'icône **une première fois avec du réseau** (mise en cache des fichiers
   et des polices), aller dans Réglages et autoriser le micro.
4. Ensuite elle fonctionne hors ligne.

Réglages iOS conseillés : **Réglages › Écran et luminosité › Verrouillage auto.** sur 5 min ou
Jamais pendant les cours (le Wake Lock des apps installées était défaillant sur certaines versions
d'iOS 17), et désactiver le mode silencieux si le bip est trop faible.

## À vérifier en conditions réelles au stand

**Bip et sortie audio**
- [ ] Volume du bip **avec le micro actif** : sur iPhone, ouvrir le micro peut baisser ou dévier
  le son (écouteur au lieu du haut-parleur). Tester à 100 % avec « Bip renforcé », sous casque
  électronique et casque passif.
- [ ] Le bip est-il audible pour le tireur à sa distance réelle du téléphone ? Sinon : enceinte
  Bluetooth (attention, ajoute de la latence → refaire la mesure) ou s'appuyer sur le flash.
- [ ] Le flash est-il visible en plein soleil ?
- [ ] Mesure de latence (Réglages) faite au calme ; noter la valeur, la refaire si on change
  d'enceinte ou d'iPhone.

**Micro et détection**
- [ ] Saturation : un tir de fusil à 1–2 m sature le micro (niveau 0 dB). C'est normal et sans
  gravité pour la détection (on ne mesure que le front montant) ; vérifier seulement que le
  vu-mètre retombe entre deux tirs rapides.
- [ ] Seuil : tirer quelques coups en regardant le vu-mètre, puis « Placer le seuil 6 dB sous
  le pic ». Vérifier que les doublés rapides sont tous comptés.
- [ ] Temps mort : avec un frein de bouche ou un pas de tir couvert (réverbération), un tir peut
  compter double → augmenter le temps mort (100–150 ms). Pour des doublés très rapides, ne pas
  dépasser l'intervalle le plus court entre deux tirs.
- [ ] **Tirs des voisins** : c'est la principale limite d'une détection par seuil. Mesurer le pic
  des tirs du poste voisin et celui du tireur suivi ; il faut un écart d'au moins 6 dB. Placer le
  téléphone près du tireur suivi (et loin des voisins), seuil juste sous ses tirs. Les tirs
  restants se barrent à l'écran Résultat.
- [ ] Coup de vent / chocs sur le téléphone : poser l'iPhone, éviter de le tenir pendant la série,
  tester une protection contre le vent devant le micro (bas de l'iPhone).
- [ ] Faux départ : un tir avant la fin du bip n'est pas compté.

**Utilisation**
- [ ] Boutons utilisables avec les gants (DÉMARRER, STOP, barrer un tir).
- [ ] L'écran reste allumé pendant une série longue.
- [ ] Appel entrant / notification pendant une série : l'audio est relancé au retour dans l'app,
  refaire la série.
- [ ] Export Excel depuis l'app installée : le menu de partage s'ouvre, « Enregistrer dans
  Fichiers » fonctionne, le fichier s'ouvre dans Excel / Numbers.
- [ ] Faire une sauvegarde JSON à la fin de chaque séance (étape 2) : Safari peut effacer les
  données d'une app non utilisée pendant plusieurs semaines.

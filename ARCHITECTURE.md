# Shot Timer — architecture

## Principes

- **100 % statique, sans étape de build** : HTML + CSS + modules ES natifs (`<script type="module">`).
  Pas de framework : un mini-routeur par hash (`#/ready`, `#/live`…) et des écrans qui rendent
  du HTML par gabarits. Rien à compiler, on pousse le dossier tel quel sur GitHub Pages.
- **Une seule dépendance externe**, ajoutée à l'étape 5 : SheetJS, copiée dans `js/vendor/`
  (pas de CDN → fonctionne hors ligne).
- **L'horloge de référence est l'horloge audio** (`AudioContext.currentTime` côté page,
  `currentFrame` côté AudioWorklet). Le bip est programmé à un instant T de cette horloge,
  chaque tir est horodaté à l'échantillon près dans le worklet. `requestAnimationFrame`
  ne sert qu'à l'affichage du chrono.

## Arborescence

```
shot-timer/
├── index.html                 Coquille unique, overlay flash, conteneur d'écran
├── manifest.webmanifest       PWA (nom, icônes, plein écran, portrait)
├── sw.js                      Service worker : précache + cache des polices
├── icons/                     icon-192.png, icon-512.png, apple-touch-icon.png
├── css/app.css                Thème contrasté, gros boutons, chiffres condensés
└── js/
    ├── app.js                 Démarrage, routes, déblocage audio au 1er geste
    ├── router.js              Routeur par hash (écran = render(root, params) → cleanup)
    ├── ui.js                  Helpers DOM, format « 1,48 », toasts, échappement
    ├── settings.js            Réglages (localStorage + événements de changement)
    ├── audio/
    │   ├── engine.js          AudioContext, micro, worklet (+ repli ScriptProcessor),
    │   │                      bip, audioSession, mesure de latence
    │   └── detector-worklet.js  Détection seuil + temps mort, niveaux pour vu-mètre
    ├── timer/
    │   ├── run.js             Machine d'état : prêt → attente → bip → écoute → arrêt
    │   ├── stats.js           Temps total, 1er tir, splits, split moyen, par
    │   └── wakelock.js        Wake Lock + ré-acquisition au retour au premier plan
    ├── screens/               Un module par écran
    │   ├── home.js            1  Accueil
    │   ├── ready.js           4  Exercice prêt (DÉMARRER)
    │   ├── live.js            5  Tir en cours
    │   ├── result.js          6  Résultat (barrer un tir parasite)
    │   ├── settings.js        9  Réglages (seuil + vu-mètre…)
    │   ├── prep.js            2  Préparation de session
    │   ├── session.js         3  Session en cours (qui tire ? → exercice)
    │   ├── sessions.js           Liste des sessions (préparées, en cours, clôturées)
    │   ├── report.js          7  Rapport (par tireur / par exercice, clôture)
    │   ├── shooters.js        8  Tireurs                         (étape 2)
    │   └── exercises.js       8  Exercices                       (étape 2)
    ├── db/                                                       (étape 2)
    │   ├── idb.js             Petite surcouche Promise d'IndexedDB
    │   ├── repo.js            CRUD tireurs, exercices, sessions, séries
    │   └── backup.js          Sauvegarde / restauration JSON complète
    ├── report/summary.js      Synthèse (tireur × exercice) : écran Rapport + export
    ├── export/xlsx.js         Classeur Synthèse + Détail (SheetJS chargé à la demande)
    ├── share.js               Remise d'un fichier : partage iOS ou téléchargement
    └── vendor/xlsx.mini.min.js   SheetJS CE 0.20.3 (Apache 2.0)
```

## Modèle de données (IndexedDB, base `shot-timer`)

| Store       | Clé  | Champs |
|-------------|------|--------|
| `shooters`  | id   | name, group? |
| `exercises` | id   | name, shots, par? (s), delay: {mode:'fixed'\|'random', min, max}, note |
| `sessions`  | id   | date, place, comment, shooterIds[], exerciseIds[], status: 'prepared'\|'running'\|'closed' |
| `strings`   | id   | sessionId, shooterId, exerciseId, shooterName, exerciseName, expected, par?, createdAt, shots: [{t, parasite, peak?, simulated?}], total, parOk, validated |

Une série recopie le nom du tireur, celui de l'exercice, le nombre de tirs attendus et le par :
le rapport reste juste même si l'exercice est modifié plus tard. Une session préparée passe
« en cours » à la première série lancée.

Index : `strings.sessionId`, `strings.shooterId`, `strings.exerciseId`. Tireurs et exercices
portent aussi `archived` : supprimer un élément déjà utilisé dans des séries l'archive (masqué
des listes) au lieu de l'effacer, pour garder les rapports complets. `js/share.js` remet un
fichier à l'utilisateur (feuille de partage iOS, sinon téléchargement) : sauvegarde et Excel. Les temps de tir sont **absolus depuis le bip** (secondes) ;
les splits sont recalculés à l'affichage, jamais stockés. Les réglages restent dans
`localStorage` et sont inclus dans la sauvegarde JSON.

## Moteur audio — chaîne de traitement

```
micro (getUserMedia, EC/NS/AGC = false)
   └─► MediaStreamSource ─► AudioWorkletNode « shot-detector » ─► (gain 0) ─► destination
                                 │  port.postMessage
                                 ├─ {type:'level', peak}      ~40×/s → vu-mètre
                                 └─ {type:'shot', frame, peak} → horodatage exact
Oscillateur (bip, programmé à T) ─► gain (volume, enveloppe) ─► destination
```

- Le worklet ne signale un tir qu'après le *frame* d'armement (= fin du bip + marge), pour
  ne pas compter le bip lui-même, et respecte le temps mort entre deux tirs.
- Temps d'un tir = `frame / sampleRate − T − latence aller-retour` ; la latence est mesurée
  dans Réglages en faisant écouter le bip au micro.

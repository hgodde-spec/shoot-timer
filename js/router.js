// Routeur par hash : « #/live?x=1 ». Chaque écran exporte render(root, params)
// et peut retourner une fonction de nettoyage appelée en quittant l'écran.

const routes = new Map();
let cleanup = null;
let root = null;

export function route(name, render) { routes.set(name, render); }

export function go(name, params = {}) {
  const q = new URLSearchParams(params).toString();
  location.hash = `#/${name}${q ? '?' + q : ''}`;
}

// Remplace l'entrée d'historique (évite de revenir sur « Tir en cours » avec Précédent).
export function replace(name, params = {}) {
  const q = new URLSearchParams(params).toString();
  history.replaceState(null, '', `#/${name}${q ? '?' + q : ''}`);
  show();
}

function parse() {
  const h = location.hash.replace(/^#\/?/, '');
  const [name, q] = h.split('?');
  return { name: name || 'home', params: Object.fromEntries(new URLSearchParams(q || '')) };
}

async function show() {
  const { name, params } = parse();
  const render = routes.get(name) || routes.get('home');
  if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } cleanup = null; }
  // Conteneur neuf à chaque écran : les écouteurs de l'écran précédent disparaissent avec lui.
  const el = document.createElement('div');
  el.className = 'screen-host';
  root.replaceChildren(el);
  window.scrollTo(0, 0);
  root.dataset.screen = name;
  cleanup = (await render(el, params)) || null;
}

export function startRouter(el) {
  root = el;
  window.addEventListener('hashchange', show);
  show();
}

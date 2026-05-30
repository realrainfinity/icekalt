// Einstiegspunkt: Service Worker registrieren, Daten seeden, Tab-Routing.
import { seedIfEmpty } from './db.js';
import { renderRecipes } from './views/recipes.js';
import { renderIngredients } from './views/ingredients.js';
import { renderSettings } from './views/settings.js';

const VIEWS = {
  recipes: { title: 'Rezepte', render: renderRecipes },
  ingredients: { title: 'Zutaten', render: renderIngredients },
  settings: { title: 'Einstellungen', render: renderSettings },
};

const appEl = document.getElementById('app');
const titleEl = document.getElementById('view-title');
const tabs = [...document.querySelectorAll('.tab')];

let current = 'recipes';

export async function navigate(view = current) {
  if (!VIEWS[view]) view = 'recipes';
  current = view;
  titleEl.textContent = VIEWS[view].title;
  tabs.forEach((t) => t.classList.toggle('active', t.dataset.view === view));
  appEl.replaceChildren();
  await VIEWS[view].render(appEl, { navigate });
  appEl.scrollTo?.(0, 0);
  window.scrollTo(0, 0);
}

tabs.forEach((t) => t.addEventListener('click', () => navigate(t.dataset.view)));

async function start() {
  await seedIfEmpty();
  await navigate('recipes');
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('./sw.js');
    } catch (e) {
      console.warn('SW-Registrierung fehlgeschlagen:', e);
    }
  }
}

start();

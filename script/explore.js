/**
 * Explore page: follow topics for a feed of books, and manage "My shelf".
 */

import { initNav, initTheme, renderMessage, renderSkeletons, renderStats, createEl } from './ui.js';
import { auth, INTERESTS, preferences } from './connect.js';
import { library, SHELVES } from './storage.js';
import { getBooksBySubject, isAbort } from './api.js';
import { createBookCard, initBookDialog } from './book-view.js';

const chipList = document.getElementById('interest-chips');
const viewSwitch = document.getElementById('view-switch');
const feedPanel = document.getElementById('feed-panel');
const shelfPanel = document.getElementById('shelf-panel');
const feedEmpty = document.getElementById('feed-empty');
const feed = document.getElementById('feed');
const shelfFilters = document.getElementById('shelf-filters');
const shelfGrid = document.getElementById('shelf-grid');
const shelfTitle = document.getElementById('shelf-title');
const stats = document.getElementById('stats');

let shelfFilter = 'all';
const rows = new Map(); // topic slug -> its feed row

// --- Topics ---------------------------------------------------------------

function renderChips() {
  const items = INTERESTS.map(({ slug, label }) => {
    const chip = createEl('button', {
      className: 'chip chip--toggle',
      text: label,
      attrs: { type: 'button', 'data-slug': slug, 'aria-pressed': String(preferences.has(slug)) },
    });
    return createEl('li', {}, chip);
  });
  chipList.replaceChildren(...items);
}

async function fillRow(slug, list) {
  const controller = new AbortController();
  list.dataset.requestId = String(Math.random());
  const requestId = list.dataset.requestId;
  rows.get(slug).controller?.abort();
  rows.get(slug).controller = controller;

  renderSkeletons(list, 6);
  list.setAttribute('aria-busy', 'true');

  try {
    const { books } = await getBooksBySubject(slug, { limit: 12, signal: controller.signal });
    if (list.dataset.requestId !== requestId) return;

    if (books.length === 0) {
      renderMessage(list, { title: 'No books found', text: 'Nothing here yet. Try another topic.' });
    } else {
      list.replaceChildren(...books.map((book, i) => createBookCard(book, { index: i })));
    }
  } catch (error) {
    if (isAbort(error) || controller.signal.aborted) return;
    renderMessage(list, {
      title: 'Could not load this topic',
      details: error.message,
      actionLabel: 'Try again',
      onAction: () => fillRow(slug, list),
    });
  } finally {
    list.setAttribute('aria-busy', 'false');
  }
}

function createRow(slug, label) {
  const list = createEl('ul', { className: 'book-row', attrs: { 'aria-busy': 'true', 'aria-label': `${label} books` } });
  const section = createEl(
    'section',
    { className: 'topic-row', attrs: { 'aria-labelledby': `row-${slug}` } },
    createEl('div', { className: 'section__head' }, createEl('h3', { text: label, attrs: { id: `row-${slug}` } })),
    list,
  );
  rows.set(slug, { section, list, controller: null });
  return { section, list };
}

/** Make the feed match the selected topics (add new rows, drop removed ones). */
function syncFeed() {
  const selected = preferences.interests;

  rows.forEach((row, slug) => {
    if (!selected.includes(slug)) {
      row.controller?.abort();
      row.section.remove();
      rows.delete(slug);
    }
  });

  selected.forEach((slug) => {
    if (rows.has(slug)) return;
    const label = INTERESTS.find((interest) => interest.slug === slug)?.label ?? slug;
    const { section, list } = createRow(slug, label);
    feed.append(section);
    fillRow(slug, list);
  });

  feedEmpty.hidden = selected.length > 0;
}

chipList.addEventListener('click', (event) => {
  const chip = event.target.closest('.chip');
  if (!chip) return;

  const nowOn = preferences.toggle(chip.dataset.slug);
  chip.setAttribute('aria-pressed', String(nowOn));
  if (auth.currentUser()) auth.saveInterests(preferences.interests);
  syncFeed();
});

// --- Views and shelf ------------------------------------------------------

function showView(view) {
  const isShelf = view === 'shelf';
  feedPanel.hidden = isShelf;
  shelfPanel.hidden = !isShelf;
  viewSwitch.querySelectorAll('.chip').forEach((chip) => {
    chip.setAttribute('aria-pressed', String(chip.dataset.view === view));
  });
  if (isShelf) renderShelf();
}

function renderShelf() {
  const summary = library.stats();
  renderStats(stats, summary);

  const counts = { all: summary.total, want: summary.want, reading: summary.reading, finished: summary.finished };
  shelfFilters.querySelectorAll('.chip').forEach((chip) => {
    const key = chip.dataset.shelf;
    chip.setAttribute('aria-pressed', String(key === shelfFilter));
    const count = chip.querySelector('[data-count]');
    if (count) count.textContent = `(${counts[key]})`;
  });

  const books = shelfFilter === 'all' ? library.all() : library.byShelf(shelfFilter);
  shelfTitle.textContent = shelfFilter === 'all' ? 'All books' : SHELVES[shelfFilter];

  if (books.length === 0) {
    renderMessage(shelfGrid, {
      title: shelfFilter === 'all' ? 'Your shelf is empty' : `Nothing on “${SHELVES[shelfFilter]}” yet`,
      text: 'Save books from your feed or from the home page and they will appear here.',
      actionLabel: shelfFilter === 'all' ? 'Browse books' : undefined,
      href: shelfFilter === 'all' ? 'index.html' : undefined,
    });
    return;
  }
  shelfGrid.replaceChildren(...books.map((book, i) => createBookCard(book, { index: i, shelfMode: true })));
}

function updateShelfCount() {
  const total = library.stats().total;
  const badge = viewSwitch.querySelector('[data-shelf-count]');
  if (badge) badge.textContent = total ? `(${total})` : '';
}

viewSwitch.addEventListener('click', (event) => {
  const chip = event.target.closest('.chip');
  if (!chip) return;
  showView(chip.dataset.view);
  history.replaceState(null, '', chip.dataset.view === 'shelf' ? '#shelf' : window.location.pathname);
});

shelfFilters.addEventListener('click', (event) => {
  const chip = event.target.closest('.chip');
  if (!chip) return;
  shelfFilter = chip.dataset.shelf;
  renderShelf();
});

// Keep counts and the shelf up to date when books are saved, moved or removed.
library.subscribe(() => {
  updateShelfCount();
  if (!shelfPanel.hidden) renderShelf();
});

// --- Start ----------------------------------------------------------------

initTheme();
initNav();
initBookDialog();

// Signed-in people bring their saved topics with them to a new device.
const user = auth.currentUser();
if (user && preferences.interests.length === 0 && user.interests.length > 0) {
  preferences.set(user.interests);
}

renderChips();
syncFeed();
updateShelfCount();
showView(window.location.hash === '#shelf' ? 'shelf' : 'feed');

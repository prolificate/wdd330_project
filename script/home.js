/**
 * Home page: theme + menu, book search, genre browsing and "Load more".
 */

import { initNav, initTheme, renderMessage, renderSkeletons } from './ui.js';
import { getBooksBySubject, isAbort, searchBooks } from './api.js';
import { createBookCard, initBookDialog } from './book-view.js';

const PAGE_SIZE = 20;

const form = document.getElementById('search-form');
const input = document.getElementById('search-input');
const errorBox = document.getElementById('search-error');
const genreList = document.getElementById('genre-list');
const results = document.getElementById('results');
const resultsTitle = document.getElementById('results-title');
const resultsCount = document.getElementById('results-count');
const loadMore = document.getElementById('load-more');

/** What is currently on screen, so "Load more" knows what to ask for. */
const state = { kind: 'subject', value: 'fiction', offset: 0, total: 0, controller: null };

function showSearchError(message) {
  errorBox.textContent = message;
  errorBox.hidden = !message;
  input.setAttribute('aria-invalid', String(Boolean(message)));
  if (message) input.setAttribute('aria-describedby', 'search-error');
  else input.removeAttribute('aria-describedby');
}

function setGenrePressed(subject) {
  genreList.querySelectorAll('.chip').forEach((chip) => {
    chip.setAttribute('aria-pressed', String(chip.dataset.subject === subject));
  });
}

function fetchPage() {
  const options = { limit: PAGE_SIZE, offset: state.offset, signal: state.controller.signal };
  return state.kind === 'search'
    ? searchBooks(state.value, options)
    : getBooksBySubject(state.value, options);
}

/** Load the first page (reset) or the next page of the current list. */
async function load({ reset }) {
  state.controller?.abort(); // drop any request that is still running
  state.controller = new AbortController();
  const { signal } = state.controller;

  if (reset) {
    state.offset = 0;
    state.total = 0;
    renderSkeletons(results, 8);
    resultsCount.textContent = '';
  }

  results.setAttribute('aria-busy', 'true');
  loadMore.hidden = true;
  loadMore.disabled = true;

  try {
    const { books, total } = await fetchPage();
    if (signal.aborted) return;

    const startIndex = reset ? 0 : results.children.length;
    if (reset) results.replaceChildren();

    if (reset && books.length === 0) {
      renderMessage(results, {
        title: 'No books found',
        text: 'Try a different title, author or topic.',
      });
      return;
    }

    books.forEach((book, i) => results.append(createBookCard(book, { index: i })));

    state.offset += books.length;
    state.total = total;

    const shown = results.children.length;
    resultsCount.textContent = `Showing ${shown} of ${total.toLocaleString()} books`;
    loadMore.hidden = books.length === 0 || shown >= total;
    if (!reset) results.children[startIndex]?.querySelector('button')?.focus({ preventScroll: false });
  } catch (error) {
    if (isAbort(error) || signal.aborted) return;

    if (reset) {
      renderMessage(results, {
        title: 'We could not load books',
        text: 'Check your internet connection and try again.',
        details: error.message,
        actionLabel: 'Try again',
        onAction: () => load({ reset: true }),
      });
    } else {
      resultsCount.textContent = 'Could not load more books. Please try again.';
      loadMore.hidden = false;
    }
  } finally {
    if (!signal.aborted) {
      results.setAttribute('aria-busy', 'false');
      loadMore.disabled = false;
    }
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const query = input.value.trim();

  if (query.length < 2) {
    showSearchError('Type at least 2 characters: a title, author or topic.');
    input.focus();
    return;
  }

  showSearchError('');
  Object.assign(state, { kind: 'search', value: query });
  setGenrePressed(null);
  resultsTitle.textContent = `Results for “${query}”`;
  load({ reset: true });
  document.getElementById('results-title').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

input.addEventListener('input', () => {
  if (!errorBox.hidden) showSearchError('');
});

genreList.addEventListener('click', (event) => {
  const chip = event.target.closest('.chip');
  if (!chip) return;

  input.value = '';
  showSearchError('');
  Object.assign(state, { kind: 'subject', value: chip.dataset.subject });
  setGenrePressed(chip.dataset.subject);
  resultsTitle.textContent = `Popular in ${chip.textContent.trim()}`;
  load({ reset: true });
});

loadMore.addEventListener('click', () => load({ reset: false }));

initTheme();
initNav();
initBookDialog();
load({ reset: true });

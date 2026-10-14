/**
 * Book cards and the book details pop-up, shared by every page that lists books.
 */

import { createEl, htmlToText, truncate, showToast } from './ui.js';
import { library, SHELVES } from './storage.js';
import { getBookDetails, isAbort } from './api.js';

const authorLine = (book) => (book.authors?.length ? book.authors.slice(0, 2).join(', ') : 'Unknown author');

/** A cover image, or a coloured placeholder showing the title. */
function createCover(book, { large = false } = {}) {
  const sizeClass = large ? ' cover--large' : '';

  if (book.cover) {
    return createEl('img', {
      className: `cover${sizeClass}`,
      attrs: {
        src: book.cover,
        alt: `Cover of ${book.title}`,
        loading: 'lazy',
        width: 200,
        height: 300,
      },
    });
  }

  return createEl(
    'div',
    { className: `cover cover--placeholder${sizeClass}`, attrs: { role: 'img', 'aria-label': `No cover for ${book.title}` } },
    createEl('span', { text: book.title }),
  );
}

/** Build a <select> for moving a saved book between shelves. */
function createShelfSelect(book, label = 'Shelf') {
  const select = createEl('select', { attrs: { 'aria-label': `${label} for ${book.title}` } });

  Object.entries(SHELVES).forEach(([value, text]) => {
    select.append(createEl('option', { text, attrs: { value, selected: library.get(book.id)?.shelf === value } }));
  });

  select.addEventListener('change', () => {
    library.move(book.id, select.value);
    showToast(`Moved to ${SHELVES[select.value]}`);
  });
  return select;
}

/**
 * One book as a list item.
 * @param {object} book
 * @param {{index?: number, shelfMode?: boolean}} [options] shelfMode shows
 *   shelf controls (move / remove) instead of a simple Save button.
 */
export function createBookCard(book, { index = 0, shelfMode = false } = {}) {
  const card = createEl('li', { className: 'book-card' });
  card.style.setProperty('--i', Math.min(index, 12));

  const open = createEl('button', {
    className: 'book-card__open',
    attrs: { type: 'button', 'aria-haspopup': 'dialog' },
  }, createEl('h3', { className: 'book-card__title', text: truncate(book.title, 70) }));
  open.addEventListener('click', () => openBookDialog(book));

  const actions = createEl('div', { className: 'book-card__actions' });

  const renderActions = () => {
    const saved = library.get(book.id);
    const parts = [];

    if (shelfMode && saved) {
      if (saved.rating > 0) {
        parts.push(createEl('p', { className: 'book-card__meta', text: `${'★'.repeat(saved.rating)}${'☆'.repeat(5 - saved.rating)}`, attrs: { 'aria-label': `Rated ${saved.rating} out of 5` } }));
      }
      if (saved.notes) parts.push(createEl('p', { className: 'book-card__notes', text: truncate(saved.notes, 90) }));
      parts.push(createShelfSelect(book, 'Move'));

      const remove = createEl('button', { className: 'btn btn--secondary', text: 'Remove', attrs: { type: 'button' } });
      remove.addEventListener('click', () => {
        library.remove(book.id);
        showToast('Removed from your shelf');
      });
      parts.push(remove);
    } else if (saved) {
      parts.push(createEl('p', { className: 'badge', text: SHELVES[saved.shelf] }));
    } else {
      const save = createEl('button', {
        className: 'btn btn--secondary btn--save',
        text: 'Save',
        attrs: { type: 'button', 'aria-pressed': 'false', 'aria-label': `Save ${book.title} to Want to Read` },
      });
      save.addEventListener('click', () => {
        library.add(book, 'want');
        showToast('Saved to Want to Read');
      });
      parts.push(save);
    }

    actions.replaceChildren(...parts);
  };

  renderActions();

  // Keep this card in step with the library; stop once it leaves the page.
  const unsubscribe = library.subscribe(() => {
    if (!card.isConnected) {
      unsubscribe();
      return;
    }
    renderActions();
  });

  card.append(
    createCover(book),
    open,
    createEl('p', { className: 'book-card__meta', text: `${authorLine(book)}${book.year ? ` · ${book.year}` : ''}` }),
    actions,
  );
  return card;
}

// ---------------------------------------------------------------------------
// Details pop-up
// ---------------------------------------------------------------------------

let detailController = null;

function getDialog() {
  return document.getElementById('book-dialog');
}

/** Wire the close button, Escape key and backdrop click. Call once per page. */
export function initBookDialog() {
  const dialog = getDialog();
  if (!dialog || dialog.dataset.initialized) return;
  dialog.dataset.initialized = 'true';

  document.getElementById('dialog-close')?.addEventListener('click', () => dialog.close());

  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close(); // click on the backdrop
  });

  dialog.addEventListener('close', () => {
    detailController?.abort();
    document.documentElement.classList.remove('modal-open');
  });
}

function createStars(book) {
  const saved = library.get(book.id);
  const rating = saved?.rating ?? 0;
  const safeId = book.id.replace(/\W/g, '');
  const row = createEl('div', { className: 'stars__row' });

  for (let value = 1; value <= 5; value += 1) {
    const input = createEl('input', {
      className: 'visually-hidden',
      attrs: { type: 'radio', name: 'rating', id: `star-${safeId}-${value}`, value, checked: rating === value },
    });
    const label = createEl('label', {
      className: value <= rating ? 'is-filled' : '',
      text: '★',
      attrs: { for: input.id, title: `${value} star${value > 1 ? 's' : ''}` },
    });
    const visuallyHidden = createEl('span', { className: 'visually-hidden', text: `${value} star${value > 1 ? 's' : ''}` });
    label.append(visuallyHidden);

    input.addEventListener('change', () => {
      library.setRating(book.id, value);
      row.querySelectorAll('label').forEach((item, i) => item.classList.toggle('is-filled', i < value));
    });
    row.append(input, label);
  }

  return createEl('fieldset', { className: 'stars' }, createEl('legend', { text: 'Your rating' }), row);
}

function renderDetail(body, book, details) {
  const render = () => {
    const saved = library.get(book.id);
    const description = htmlToText(details.description);

    const meta = createEl('dl', { className: 'book-meta' });
    const addMeta = (label, value) => {
      if (value) meta.append(createEl('div', {}, createEl('dt', { text: label }), createEl('dd', { text: String(value) })));
    };
    addMeta('First published', details.firstPublished || book.year);
    addMeta('Shelf', saved ? SHELVES[saved.shelf] : null);

    const info = createEl('div', {},
      createEl('h2', { text: book.title, attrs: { id: 'dialog-title', tabindex: '-1' } }),
      createEl('p', { className: 'book-detail__author', text: details.authors?.length ? details.authors.join(', ') : authorLine(book) }),
      meta,
    );

    if (details.subjects?.length) {
      info.append(createEl('ul', { className: 'tags' }, details.subjects.slice(0, 8).map((subject) => createEl('li', { className: 'tag', text: subject }))));
    }

    info.append(createEl('p', { text: description ? truncate(description, 900) : 'No description available for this book.' }));

    if (saved) {
      const notes = createEl('textarea', { attrs: { id: 'book-notes', rows: 3, maxlength: 2000, placeholder: 'Your thoughts…' } });
      notes.value = saved.notes || '';
      notes.addEventListener('change', () => {
        library.setNotes(book.id, notes.value);
        showToast('Notes saved');
      });

      const remove = createEl('button', { className: 'btn btn--secondary', text: 'Remove from shelf', attrs: { type: 'button' } });
      remove.addEventListener('click', () => {
        library.remove(book.id);
        showToast('Removed from your shelf');
      });

      info.append(
        createEl('div', { className: 'field' }, createEl('label', { text: 'Move to shelf', attrs: { for: 'detail-shelf' } }), (() => {
          const select = createShelfSelect(book);
          select.id = 'detail-shelf';
          return select;
        })()),
        createStars(book),
        createEl('div', { className: 'field' }, createEl('label', { text: 'Notes', attrs: { for: 'book-notes' } }), notes),
        remove,
      );
    } else {
      const save = createEl('button', { className: 'btn btn--primary', text: 'Save to Want to Read', attrs: { type: 'button' } });
      save.addEventListener('click', () => {
        library.add(book, 'want');
        showToast('Saved to Want to Read');
      });
      info.append(save);
    }

    const cover = createCover({ ...book, cover: details.cover || book.cover }, { large: true });
    const wrap = createEl('div', { className: 'book-detail__cover' }, cover);
    body.replaceChildren(createEl('div', { className: 'book-detail' }, wrap, info));
  };

  render();

  // Re-render when the library changes while the pop-up is open (not while typing notes).
  const unsubscribe = library.subscribe(() => {
    if (!getDialog()?.open) {
      unsubscribe();
      return;
    }
    if (document.activeElement?.id === 'book-notes') return;
    render();
    body.querySelector('#detail-shelf, .btn')?.focus?.();
  });
}

/** Open the pop-up for a book and load its full details. */
export async function openBookDialog(book) {
  const dialog = getDialog();
  const body = document.getElementById('dialog-body');
  if (!dialog || !body) return;

  initBookDialog();
  detailController?.abort();
  detailController = new AbortController();
  const { signal } = detailController;

  body.replaceChildren(
    createEl('h2', { className: 'visually-hidden', text: book.title, attrs: { id: 'dialog-title' } }),
    createEl('div', { className: 'detail-skeleton', attrs: { 'aria-busy': 'true' } },
      createEl('div', { className: 'skeleton skeleton--cover' }),
      createEl('div', {}, createEl('div', { className: 'skeleton skeleton--line' }), createEl('div', { className: 'skeleton skeleton--line skeleton--short' }))),
  );

  if (!dialog.open) {
    document.documentElement.classList.add('modal-open');
    dialog.showModal();
  }

  try {
    const details = await getBookDetails(book.id, signal);
    if (signal.aborted) return;
    renderDetail(body, book, details);
  } catch (error) {
    if (isAbort(error) || signal.aborted) return;
    // Still show what we already know, plus a way to retry.
    renderDetail(body, book, { description: '', subjects: [], authors: book.authors, cover: null });
    body.querySelector('.book-detail > div:last-child')?.prepend(
      createEl('p', { className: 'form-error', text: 'Full details could not be loaded.', attrs: { role: 'status' } }),
    );
  }
}


/**
 * BookNest UI module
 * Handles navigation, themes, interface elements, and DOM helpers.
 */

import { auth } from './connect.js';



/**
 * Create an HTML element with optional attributes and children.
 */
export function createEl(tag, options = {}, ...children) {
  const { className, text, attrs = {} } = options;
  const element = document.createElement(tag);

  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;

  Object.entries(attrs).forEach(([name, value]) => {
    if (value === null || value === undefined || value === false) return;
    element.setAttribute(name, value === true ? '' : String(value));
  });

  children.flat().forEach((child) => {
    if (child) element.append(child);
  });

  return element;
}

/**
 * Convert HTML content into plain text.
 */
export function htmlToText(html = '') {
  if (!html) return '';

  const withBreaks = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n');

  const doc = new DOMParser().parseFromString(withBreaks, 'text/html');
  return doc.body.textContent.trim();
}

/**
 * Shorten text without cutting off a word.
 */
export function truncate(text, max = 120) {
  if (text.length <= max) return text;

  return `${text.slice(0, max).replace(/\s+\S*$/, '')}…`;
}

// ==========================================
// 2. NAVIGATION
// ==========================================

function markCurrentPage(nav) {
  const current =
    window.location.pathname.split('/').pop() || 'index.html';

  nav.querySelectorAll('a').forEach((link) => {
    const target = new URL(link.href).pathname.split('/').pop() || 'index.html';

    if (target === current) {
      link.setAttribute('aria-current', 'page');
    } else {
      link.removeAttribute('aria-current');
    }
  });
}

/**
 * Update the Connect link based on the signed-in user.
 */
export function refreshAuthLink() {
  const link = document.querySelector('[data-auth-link]');
  if (!link) return;

  const user = auth.currentUser();
  const firstName = user?.name?.split(' ')[0]?.slice(0, 14);

  link.textContent = firstName ? `Hi, ${firstName}` : 'Connect';
}

/**
 * Set up the mobile navigation menu.
 */
export function initNav() {
  const toggle = document.getElementById('menu-toggle');
  const nav = document.getElementById('site-nav');

  if (!toggle || !nav || toggle.dataset.initialized) return;

  toggle.dataset.initialized = 'true';

  markCurrentPage(nav);
  refreshAuthLink();

  nav.classList.add('is-collapsed');

  const setOpen = (open) => {
    toggle.setAttribute('aria-expanded', String(open));
    nav.classList.toggle('is-collapsed', !open);
  };

  toggle.addEventListener('click', () => {
    setOpen(toggle.getAttribute('aria-expanded') !== 'true');
  });

  nav.addEventListener('click', (event) => {
    if (event.target.closest('a')) setOpen(false);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
      setOpen(false);
      toggle.focus();
    }
  });
}

// ==========================================
// 3. LIGHT AND DARK THEME
// ==========================================

const THEME_KEY = 'booknest.theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

function readSavedTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    return saved === 'light' || saved === 'dark' ? saved : null;
  } catch {
    return null;
  }
}

function saveTheme(theme) {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // The theme still works for the current visit.
  }
}

/**
 * Set up the theme toggle button.
 */
export function initTheme() {
  const button = document.getElementById('theme-toggle');

  if (!button || button.dataset.initialized) return;

  button.dataset.initialized = 'true';

  const deviceQuery = window.matchMedia?.(DARK_QUERY);
  const deviceTheme = () => (deviceQuery?.matches ? 'dark' : 'light');

  const apply = (theme) => {
    document.documentElement.setAttribute('data-theme', theme);
    button.setAttribute('aria-pressed', String(theme === 'dark'));
    button.setAttribute(
      'aria-label',
      theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode',
    );
  };

  apply(readSavedTheme() ?? deviceTheme());

  button.addEventListener('click', () => {
    const next =
      document.documentElement.getAttribute('data-theme') === 'dark'
        ? 'light'
        : 'dark';

    apply(next);
    saveTheme(next);
  });

  deviceQuery?.addEventListener?.('change', () => {
    if (!readSavedTheme()) apply(deviceTheme());
  });
}

// ==========================================
// 4. TOAST NOTIFICATIONS
// ==========================================

/**
 * Display a temporary message at the bottom of the page.
 */
export function showToast(message, { duration = 3000 } = {}) {
  const region = document.getElementById('toast-region');
  if (!region) return;

  const toast = createEl('p', {
    className: 'toast',
    text: message,
  });

  region.append(toast);
  setTimeout(() => toast.remove(), duration);
}

// ==========================================
// 5. LIBRARY STATISTICS
// ==========================================

/**
 * Display reading statistics.
 */
export function renderStats(container, stats) {
  const average =
    stats.averageRating === null ? '–' : stats.averageRating.toFixed(1);

  const items = [
    ['Books saved', stats.total],
    ['Currently reading', stats.reading],
    ['Finished', stats.finished],
    ['Average rating', average],
  ];

  const cards = items.map(([label, value], index) => {
    const card = createEl(
      'div',
      { className: 'stat' },
      createEl('dt', { text: label }),
      createEl('dd', { text: String(value) }),
    );

    card.style.setProperty('--i', index);
    return card;
  });

  container.replaceChildren(...cards);
}

// ==========================================
// 6. LOADING PLACEHOLDERS
// ==========================================

/**
 * Display placeholder cards while books are loading.
 */
export function renderSkeletons(container, count = 8) {
  const cards = Array.from({ length: count }, () =>
    createEl(
      'li',
      {
        className: 'skeleton-card',
        attrs: { 'aria-hidden': 'true' },
      },
      createEl('div', { className: 'skeleton skeleton--cover' }),
      createEl('div', { className: 'skeleton skeleton--line' }),
      createEl('div', {
        className: 'skeleton skeleton--line skeleton--short',
      }),
    ),
  );

  container.replaceChildren(...cards);
}

// ==========================================
// 7. EMPTY AND ERROR MESSAGES
// ==========================================

/**
 * Display an empty state or an error message.
 */
export function renderMessage(
  container,
  {
    title,
    text = '',
    details = '',
    actionLabel,
    onAction,
    href,
  },
) {
  const tag = container.tagName === 'UL' ? 'li' : 'div';

  const box = createEl(
    tag,
    { className: 'message' },
    createEl('h3', { text: title }),
  );

  if (text) {
    box.append(createEl('p', { className: 'muted', text }));
  }

  if (details) {
    box.append(
      createEl('p', {
        className: 'message__details',
        text: `Details: ${details}`,
      }),
    );
  }

  if (actionLabel && href) {
    box.append(
      createEl('a', {
        className: 'btn btn--primary',
        text: actionLabel,
        attrs: { href },
      }),
    );
  } else if (actionLabel && onAction) {
    const button = createEl('button', {
      className: 'btn btn--primary',
      text: actionLabel,
      attrs: { type: 'button' },
    });

    button.addEventListener('click', onAction);
    box.append(button);
  }

  container.replaceChildren(box);
}

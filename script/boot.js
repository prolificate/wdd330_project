/**
 * Boot script. Loaded in <head> as a classic script (not a module) so that it
 * runs before the page paints.
 *
 *  1. Applies the saved colour theme early, which avoids a light/dark flash.
 *  2. Explains why nothing loads when the page is opened from file://,
 *     because browsers block ES modules there.
 */
(() => {
  'use strict';

  try {
    const savedTheme = localStorage.getItem('booknest.theme');
    const preferredTheme = window.matchMedia?.('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';

    const theme = savedTheme === 'dark' || savedTheme === 'light'
      ? savedTheme
      : preferredTheme;

    document.documentElement.setAttribute('data-theme', theme);
  } catch (error) {
    // Storage can be blocked; the stylesheet's default (light) theme is used.
    document.documentElement.setAttribute('data-theme', 'light');
  }

  if (window.location.protocol === 'file:') {
    document.addEventListener('DOMContentLoaded', () => {
      const banner = document.createElement('p');
      banner.className = 'system-banner';
      banner.setAttribute('role', 'alert');
      banner.textContent = 'This page was opened as a plain file, and browsers block BookNest’s scripts that way, '
        + 'so the menu, dark mode and search will not work. In VS Code, right-click index.html and choose '
        + '“Open with Live Server” (or publish the site, for example with GitHub Pages).';
      document.body.prepend(banner);
    });
  }
})();

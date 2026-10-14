/**
 * Connect page: sign in, create an account, and the signed-in profile.
 * Account logic lives in connect.js; this file only handles the page.
 */

import { initNav, initTheme, refreshAuthLink, renderStats, showToast, createEl } from './ui.js';
import { auth, AuthError, INTERESTS, preferences } from './connect.js';
import { library } from './storage.js';

const signedOut = document.getElementById('signed-out');
const signedIn = document.getElementById('signed-in');
const authTitle = document.getElementById('auth-title');
const welcomeTitle = document.getElementById('welcome-title');
const signinForm = document.getElementById('signin-form');
const signupForm = document.getElementById('signup-form');
const profileForm = document.getElementById('profile-form');
const modeChips = signedOut.querySelectorAll('[data-mode]');

// --- Validation -----------------------------------------------------------

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const RULES = {
  required: (value) => (value ? '' : 'Please enter your password.'),
  name: (value) => (value.trim().length >= 2 ? '' : 'Please enter your name (at least 2 characters).'),
  email: (value) => (EMAIL_PATTERN.test(value.trim()) ? '' : 'Please enter a valid email, like name@example.com.'),
  password: (value) => (value.length >= 8 ? '' : 'Your password needs at least 8 characters.'),
};

function setFieldError(input, message) {
  const error = document.getElementById(`${input.id}-error`);
  const hint = input.dataset.describedby;
  if (error) {
    error.textContent = message;
    error.hidden = !message;
  }
  input.setAttribute('aria-invalid', String(Boolean(message)));
  input.setAttribute('aria-describedby', [hint, message ? error?.id : null].filter(Boolean).join(' '));
  if (!input.getAttribute('aria-describedby')) input.removeAttribute('aria-describedby');
}

function validateField(input) {
  const rule = RULES[input.dataset.rule];
  const message = rule ? rule(input.value) : '';
  setFieldError(input, message);
  return !message;
}

/** Validate every field; focus the first one that is wrong. */
function validateForm(form) {
  const inputs = [...form.querySelectorAll('[data-rule]')];
  const failed = inputs.filter((input) => !validateField(input));
  failed[0]?.focus();
  return failed.length === 0;
}

function showFormError(form, message) {
  const box = form.querySelector('.form-error');
  box.textContent = message;
  box.hidden = !message;
}

[signinForm, signupForm].forEach((form) => {
  form.addEventListener('focusout', (event) => {
    if (event.target.matches('[data-rule]') && event.target.value) validateField(event.target);
  });
  form.addEventListener('input', (event) => {
    if (event.target.getAttribute('aria-invalid') === 'true') validateField(event.target);
    showFormError(form, '');
  });
});

// --- Mode switch and password toggles ------------------------------------

function setMode(mode, { focus = false } = {}) {
  const isSignup = mode === 'signup';
  signinForm.hidden = isSignup;
  signupForm.hidden = !isSignup;
  authTitle.textContent = isSignup ? 'Create your account' : 'Welcome back';
  modeChips.forEach((chip) => chip.setAttribute('aria-pressed', String(chip.dataset.mode === mode)));
  if (focus) authTitle.focus();
}

modeChips.forEach((chip) => chip.addEventListener('click', () => setMode(chip.dataset.mode)));

document.querySelectorAll('[data-toggle-password]').forEach((button) => {
  button.addEventListener('click', () => {
    const field = document.getElementById(button.dataset.togglePassword);
    const show = field.type === 'password';
    field.type = show ? 'text' : 'password';
    button.textContent = show ? 'Hide' : 'Show';
    button.setAttribute('aria-pressed', String(show));
  });
});

// --- Topic checkboxes -----------------------------------------------------

function renderInterests(container, selected = []) {
  const name = container.dataset.interests;
  const items = INTERESTS.map(({ slug, label }) => {
    const id = `${name}-interest-${slug}`;
    return createEl(
      'div',
      { className: 'check' },
      createEl('input', { attrs: { type: 'checkbox', id, value: slug, checked: selected.includes(slug) } }),
      createEl('label', { text: label, attrs: { for: id } }),
    );
  });
  container.replaceChildren(...items);
}

const checkedTopics = (container) => [...container.querySelectorAll('input:checked')].map((box) => box.value);

// --- Signed-in / signed-out views ----------------------------------------

function showProfile(user, { focus = false } = {}) {
  signedOut.hidden = true;
  signedIn.hidden = false;

  document.getElementById('avatar').textContent = user.name.trim().charAt(0).toUpperCase() || '?';
  document.getElementById('profile-email').textContent = user.email;
  welcomeTitle.textContent = `Hi, ${user.name.split(' ')[0]}`;
  renderStats(document.getElementById('profile-stats'), library.stats());
  renderInterests(profileForm.querySelector('[data-interests]'), preferences.interests);
  refreshAuthLink();
  if (focus) welcomeTitle.focus();
}

function showSignedOut({ focus = false, mode = 'signin' } = {}) {
  signedIn.hidden = true;
  signedOut.hidden = false;
  refreshAuthLink();
  setMode(mode);
  if (focus) authTitle.focus();
}

// --- Submit handlers ------------------------------------------------------

async function submit(form, action) {
  showFormError(form, '');
  if (!validateForm(form)) return;

  const button = form.querySelector('[type="submit"]');
  const label = button.textContent;
  button.disabled = true;
  button.textContent = 'Please wait…';

  try {
    const user = await action(new FormData(form));
    if (user.interests.length) preferences.set(user.interests);
    form.reset();
    showProfile(user, { focus: true });
    showToast(`Welcome, ${user.name.split(' ')[0]}!`);
  } catch (error) {
    if (!(error instanceof AuthError)) console.error(error);
    const message = error instanceof AuthError ? error.message : 'Something went wrong. Please try again.';
    const field = error instanceof AuthError && error.field ? form.querySelector(`[name="${error.field}"]`) : null;

    if (field) {
      setFieldError(field, message);
      field.focus();
    } else {
      showFormError(form, message);
    }
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
}

signinForm.addEventListener('submit', (event) => {
  event.preventDefault();
  submit(signinForm, (data) => auth.signIn({ email: data.get('email'), password: data.get('password') }));
});

signupForm.addEventListener('submit', (event) => {
  event.preventDefault();
  submit(signupForm, (data) => auth.signUp({
    name: data.get('name'),
    email: data.get('email'),
    password: data.get('password'),
    interests: checkedTopics(signupForm.querySelector('[data-interests]')),
  }));
});

profileForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const topics = checkedTopics(profileForm.querySelector('[data-interests]'));
  try {
    auth.saveInterests(topics);
    preferences.set(topics);
    showToast('Topics saved');
  } catch (error) {
    showToast(error instanceof AuthError ? error.message : 'Could not save your topics.');
  }
});

document.getElementById('signout').addEventListener('click', () => {
  auth.signOut();
  showSignedOut({ focus: true });
  showToast('You have signed out');
});

// --- Start ----------------------------------------------------------------

initTheme();
initNav();
renderInterests(signupForm.querySelector('[data-interests]'));

const current = auth.currentUser();
if (current) showProfile(current);
else showSignedOut({ mode: window.location.hash === '#signup' ? 'signup' : 'signin' });

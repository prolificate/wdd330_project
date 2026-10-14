
/**
 * BookNest main module
 * Handles accounts, authentication, and favourite topics.
 */

const USERS_KEY = 'booknest.users';
const SESSION_KEY = 'booknest.session';
const INTERESTS_KEY = 'booknest.interests';
const PBKDF2_ITERATIONS = 100_000;

// Available topics
export const INTERESTS = Object.freeze([
  { slug: 'fiction', label: 'Fiction' },
  { slug: 'fantasy', label: 'Fantasy' },
  { slug: 'science_fiction', label: 'Sci-Fi' },
  { slug: 'romance', label: 'Romance' },
  { slug: 'mystery_and_detective_stories', label: 'Mystery' },
  { slug: 'thriller', label: 'Thriller' },
  { slug: 'history', label: 'History' },
  { slug: 'biography', label: 'Biography' },
  { slug: 'self-help', label: 'Self-help' },
  { slug: 'programming', label: 'Programming' },
  { slug: 'business', label: 'Business' },
  { slug: 'psychology', label: 'Psychology' },
  { slug: 'poetry', label: 'Poetry' },
]);

export function isInterest(slug) {
  return INTERESTS.some((interest) => interest.slug === slug);
}

export function interestLabel(slug) {
  const match = INTERESTS.find((interest) => interest.slug === slug);
  return match ? match.label : slug.replaceAll('_', ' ');
}

// Authentication errors
export class AuthError extends Error {
  constructor(message, field = null) {
    super(message);
    this.name = 'AuthError';
    this.field = field;
  }
}

// Helper functions
const toHex = (bytes) =>
  [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');

const fromHex = (hex) =>
  Uint8Array.from(hex.match(/.{2}/g) ?? [], (pair) => parseInt(pair, 16));

const normalizeEmail = (email) => email.trim().toLowerCase();

async function hashPassword(password, salt) {
  if (!window.crypto?.subtle) {
    throw new AuthError(
      'Signing in needs a secure connection (https:// or localhost).',
    );
  }

  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    material,
    256,
  );

  return toHex(new Uint8Array(bits));
}

// Account storage
function readUsers() {
  try {
    const users = JSON.parse(localStorage.getItem(USERS_KEY) ?? '{}');
    return users && typeof users === 'object' && !Array.isArray(users)
      ? users
      : {};
  } catch {
    return {};
  }
}

function writeUsers(users) {
  try {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  } catch {
    throw new AuthError(
      'We could not save your account. Check that this browser allows site storage.',
    );
  }
}

function startSession(email) {
  try {
    localStorage.setItem(SESSION_KEY, email);
  } catch {
    throw new AuthError(
      'We could not keep you signed in. Check that this browser allows site storage.',
    );
  }
}

class Auth {
  currentUser() {
    try {
      const email = localStorage.getItem(SESSION_KEY);
      const record = email ? readUsers()[email] : null;

      if (!record) return null;

      return {
        name: record.name,
        email,
        interests: record.interests ?? [],
      };
    } catch {
      return null;
    }
  }

  async signUp({ name, email, password, interests = [] }) {
    const cleanEmail = normalizeEmail(email);
    const users = readUsers();

    if (users[cleanEmail]) {
      throw new AuthError(
        'An account with this email already exists. Try signing in instead.',
        'email',
      );
    }

    const salt = crypto.getRandomValues(new Uint8Array(16));

    users[cleanEmail] = {
      name: name.trim(),
      salt: toHex(salt),
      hash: await hashPassword(password, salt),
      interests: [...interests].filter(isInterest),
      createdAt: Date.now(),
    };

    writeUsers(users);
    startSession(cleanEmail);

    return this.currentUser();
  }

  async signIn({ email, password }) {
    const cleanEmail = normalizeEmail(email);
    const record = readUsers()[cleanEmail];

    const hash = record
      ? await hashPassword(password, fromHex(record.salt))
      : null;

    if (!record || hash !== record.hash) {
      throw new AuthError(
        'That email and password do not match. Please try again.',
      );
    }

    startSession(cleanEmail);
    return this.currentUser();
  }

  signOut() {
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch {
      // Nothing else to do.
    }
  }

  saveInterests(interests) {
    const user = this.currentUser();
    if (!user) return;

    const users = readUsers();
    users[user.email].interests = [...interests].filter(isInterest);
    writeUsers(users);
  }
}

export const auth = new Auth();

// Favourite topic preferences
class Preferences {
  #list;

  constructor() {
    this.#list = this.#load();
  }

  #load() {
    try {
      const saved = JSON.parse(
        localStorage.getItem(INTERESTS_KEY) ?? '[]',
      );

      return Array.isArray(saved) ? saved.filter(isInterest) : [];
    } catch {
      return [];
    }
  }

  #save() {
    try {
      localStorage.setItem(INTERESTS_KEY, JSON.stringify(this.#list));
    } catch {
      // Preferences remain available during this visit.
    }
  }

  get interests() {
    return [...this.#list];
  }

  has(slug) {
    return this.#list.includes(slug);
  }

  toggle(slug) {
    if (!isInterest(slug)) return false;

    this.#list = this.has(slug)
      ? this.#list.filter((item) => item !== slug)
      : [...this.#list, slug];

    this.#save();
    return this.has(slug);
  }

  set(slugs) {
    this.#list = [...new Set(slugs)].filter(isInterest);
    this.#save();
  }
}

export const preferences = new Preferences();

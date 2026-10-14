
/**
 * BookNest Library
 * Saves books and manages reading progress using localStorage.
 */

const STORAGE_KEY = 'booknest.library';

export const SHELVES = Object.freeze({
  want: 'Want to Read',
  reading: 'Reading',
  finished: 'Finished',
});

export class Library {
  #key;
  #books;
  #listeners = new Set();

  constructor(key = STORAGE_KEY) {
    this.#key = key;
    this.#books = this.#load();
  }

  // Read saved books safely.
  #load() {
    try {
      const saved = JSON.parse(localStorage.getItem(this.#key) ?? '[]');

      if (!Array.isArray(saved)) return [];

      return saved.filter(
        (book) => book?.id && book?.title && SHELVES[book.shelf],
      );
    } catch {
      return [];
    }
  }

  // Save changes and notify subscribers.
  #save() {
    try {
      localStorage.setItem(this.#key, JSON.stringify(this.#books));
    } catch {
      // Keep changes available for the current visit.
    }

    this.#listeners.forEach((listener) => listener());
  }

  // Listen for Library changes.
  subscribe(listener) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  // Return all books, newest first.
  all() {
    return [...this.#books].sort(
      (a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0),
    );
  }

  // Return books from one shelf.
  byShelf(shelf) {
    return this.all().filter((book) => book.shelf === shelf);
  }

  // Find a book by ID.
  get(id) {
    return this.#books.find((book) => book.id === id) ?? null;
  }

  // Check whether a book is saved.
  has(id) {
    return this.get(id) !== null;
  }

  // Add a book or move it if already saved.
  add(book, shelf = 'want') {
    if (!book?.id || !book?.title) {
      throw new Error('A book must have an ID and title.');
    }

    if (!SHELVES[shelf]) {
      throw new Error(`Unknown shelf: ${shelf}`);
    }

    if (this.has(book.id)) {
      return this.move(book.id, shelf);
    }

    const entry = {
      id: book.id,
      title: book.title,
      authors: book.authors ?? [],
      year: book.year ?? null,
      cover: book.cover ?? null,
      shelf,
      rating: 0,
      notes: '',
      addedAt: Date.now(),
    };

    this.#books.push(entry);
    this.#save();

    return entry;
  }

  // Move a book to another shelf.
  move(id, shelf) {
    if (!SHELVES[shelf]) {
      throw new Error(`Unknown shelf: ${shelf}`);
    }

    const book = this.get(id);
    if (!book) return null;

    book.shelf = shelf;
    book.finishedAt = shelf === 'finished' ? Date.now() : null;

    this.#save();
    return book;
  }

  // Remove a book from the Library.
  remove(id) {
    const originalLength = this.#books.length;

    this.#books = this.#books.filter((book) => book.id !== id);

    if (this.#books.length !== originalLength) {
      this.#save();
    }
  }

  // Rate a book from 0 to 5.
  setRating(id, rating) {
    const book = this.get(id);
    if (!book) return;

    book.rating = Math.min(5, Math.max(0, Math.round(rating)));
    this.#save();
  }

  // Save personal notes for a book.
  setNotes(id, notes) {
    const book = this.get(id);
    if (!book) return;

    book.notes = String(notes).trim().slice(0, 2000);
    this.#save();
  }

  // Calculate reading statistics.
  stats() {
    const rated = this.#books.filter((book) => book.rating > 0);

    const averageRating = rated.length
      ? rated.reduce((sum, book) => sum + book.rating, 0) / rated.length
      : null;

    return {
      total: this.#books.length,
      want: this.byShelf('want').length,
      reading: this.byShelf('reading').length,
      finished: this.byShelf('finished').length,
      averageRating,
    };
  }
}

// Shared Library instance.
export const library = new Library();

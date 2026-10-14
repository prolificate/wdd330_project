/**
 * BookNest API
 * Fetches book information from Open Library.
 */

const BASE_URL = 'https://openlibrary.org';
const COVER_URL = 'https://covers.openlibrary.org/b/id';
const TIMEOUT_MS = 12000;

/**
 * Request JSON from an API. Gives up after a timeout, and can be cancelled
 * with an AbortSignal (used to drop out-of-date searches).
 */
async function request(url, signal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('timeout')), TIMEOUT_MS);
  const cancel = () => controller.abort(signal.reason);

  if (signal) {
    if (signal.aborted) cancel();
    else signal.addEventListener('abort', cancel, { once: true });
  }

  try {
    const response = await fetch(url, { signal: controller.signal });

    if (!response.ok) {
      throw new Error(`Book request failed (${response.status}).`);
    }

    return await response.json();
  } catch (error) {
    if (signal?.aborted) throw error; // caller cancelled on purpose
    if (controller.signal.aborted) {
      throw new Error('The book service took too long to answer. Please try again.');
    }
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}

/** True when an error only means "this request was cancelled". */
export function isAbort(error) {
  return error?.name === 'AbortError' || error?.name === 'TimeoutError';
}

/**
 * Convert API results into one book shape.
 * The search endpoint and the subjects endpoint name their fields differently:
 *   search:   author_name: ['A'], cover_i: 123
 *   subjects: authors: [{ name: 'A' }], cover_id: 123
 */
function formatBook(book) {
  const coverId = book.cover_i ?? book.cover_id ?? null;
  const authors = book.author_name
    ?? book.authors?.map((author) => author.name).filter(Boolean)
    ?? [];

  return {
    id: book.key || book.id,
    title: book.title || 'Untitled',
    authors,
    year: book.first_publish_year || null,
    cover: coverId ? `${COVER_URL}/${coverId}-M.jpg` : null,
    subjects: book.subject || [],
  };
}

/**
 * Search for books by title, author, or keyword.
 * @param {string} query
 * @param {{limit?: number, offset?: number, signal?: AbortSignal}} [options]
 * @returns {Promise<{books: object[], total: number}>}
 */
export async function searchBooks(query, { limit = 20, offset = 0, signal } = {}) {
  const text = query.trim();
  if (!text) return { books: [], total: 0 };

  const params = new URLSearchParams({
    q: text,
    limit: String(limit),
    offset: String(offset),
    fields: 'key,title,author_name,first_publish_year,cover_i,subject',
  });

  const data = await request(`${BASE_URL}/search.json?${params}`, signal);
  const books = (data.docs || []).filter((doc) => doc.key).map(formatBook);

  return { books, total: data.numFound ?? books.length };
}

/**
 * Discover books by subject.
 * Examples: fantasy, romance, programming.
 * @param {string} subject
 * @param {{limit?: number, offset?: number, signal?: AbortSignal}} [options]
 * @returns {Promise<{books: object[], total: number}>}
 */
export async function getBooksBySubject(subject, { limit = 20, offset = 0, signal } = {}) {
  const name = subject.trim();
  if (!name) return { books: [], total: 0 };

  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });

  const data = await request(
    `${BASE_URL}/subjects/${encodeURIComponent(name)}.json?${params}`,
    signal,
  );
  const books = (data.works || []).filter((work) => work.key).map(formatBook);

  return { books, total: data.work_count ?? books.length };
}

/**
 * Retrieve detailed information about one book, including author names.
 * @param {string} bookId - A work key such as "/works/OL45883W".
 * @param {AbortSignal} [signal]
 */
export async function getBookDetails(bookId, signal) {
  if (!bookId) {
    throw new Error('A book ID is required.');
  }

  const path = bookId.startsWith('/works/') ? bookId : `/works/${bookId}`;
  const book = await request(`${BASE_URL}${path}.json`, signal);

  // A work only lists author keys, so look each name up (best effort).
  const authorKeys = (book.authors || [])
    .map((entry) => entry.author?.key)
    .filter(Boolean)
    .slice(0, 4);

  const lookups = await Promise.allSettled(
    authorKeys.map((key) => request(`${BASE_URL}${key}.json`, signal)),
  );
  const authors = lookups
    .filter((result) => result.status === 'fulfilled')
    .map((result) => result.value.name)
    .filter(Boolean);

  const description = typeof book.description === 'string'
    ? book.description
    : book.description?.value;

  return {
    id: book.key,
    title: book.title || 'Untitled',
    description: description || '',
    subjects: book.subjects || [],
    authors,
    cover: book.covers?.find((id) => id > 0)
      ? `${COVER_URL}/${book.covers.find((id) => id > 0)}-L.jpg`
      : null,
    firstPublished: book.first_publish_date || null,
  };
}

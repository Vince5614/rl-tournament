/**
 * Public display-name helpers.
 * The real name (from Clerk) is never shown publicly.
 * Instead we store a user-chosen handle in localStorage.
 */

const KEY = id => `pubname_${id}`;

/** Returns the stored public username, falling back to the Clerk username (never fullName). */
export function getPubName(user) {
  if (!user) return 'Player';
  const stored = localStorage.getItem(KEY(user.id));
  if (stored) return stored;
  return user.username || 'Player';
}

/** Persists a new public username. */
export function setPubName(userId, name) {
  localStorage.setItem(KEY(userId), name.trim());
}

/** Returns true when the user has never set a public username. */
export function hasNoPubName(user) {
  if (!user) return false;
  return !localStorage.getItem(KEY(user.id));
}

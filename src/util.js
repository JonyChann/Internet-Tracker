const crypto = require('crypto');

/** RFC 4122 v4 UUID for runtimes without crypto.randomUUID (Node 10). */
function randomUUID() {
  const bytes = crypto.randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Nullish coalescing with Node 10-compatible syntax. */
function coalesce(value, fallback) {
  return value === undefined || value === null ? fallback : value;
}

module.exports = { randomUUID, coalesce };

/* seed.js — deterministic seeds, seeded PRNG, and shareable life URLs.
 *
 * Shareable lives work without any backend or database:
 *   1. createSeed() makes a random 8-hex-char seed (crypto-backed).
 *   2. createSeededRng(seed) builds a deterministic PRNG for that seed.
 *   3. App.generateLife(seed) (see generator.js) runs the normal life
 *      generation algorithm using only that PRNG, so the same seed always
 *      yields the same life (given the same country dataset).
 *   4. The seed travels in the URL path: /life/v1/<seed> ("v1" pins the
 *      generation algorithm + data version so future v2 links can coexist).
 *
 * Depends on: nothing. Must load before generator.js.
 */
(function (global) {
  'use strict';
  var App = global.App = global.App || {};

  // Generation version pinned into share URLs. Bump + add a dispatch entry
  // (and keep the old algorithm around) if the algorithm or dataset ever
  // changes incompatibly, so old links keep working as /life/v1/<seed>.
  var GENERATOR_VERSION = 'v1';
  var SUPPORTED_VERSIONS = ['v1'];

  // Seeds are 32-bit values rendered as exactly 8 lowercase hex chars.
  var SEED_RE = /^[0-9a-f]{8}$/;

  function normalizeSeed(seed) {
    if (typeof seed !== 'string') throw new Error('seed must be a string');
    var s = seed.trim().toLowerCase();
    if (!SEED_RE.test(s)) throw new Error('invalid seed: ' + seed);
    return s;
  }

  function isValidSeed(seed) {
    return typeof seed === 'string' && SEED_RE.test(seed.trim().toLowerCase());
  }

  // New random seed. Uses crypto.getRandomValues() when available, falling
  // back to Math.random() only for seed *creation* (never for generation).
  function createSeed() {
    var bytes = null;
    try {
      if (global.crypto && typeof global.crypto.getRandomValues === 'function') {
        bytes = new Uint8Array(4);
        global.crypto.getRandomValues(bytes);
      }
    } catch (e) { bytes = null; }
    if (!bytes) {
      bytes = new Uint8Array(4);
      for (var i = 0; i < 4; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    var out = '';
    for (var j = 0; j < bytes.length; j++) {
      out += (bytes[j] < 16 ? '0' : '') + bytes[j].toString(16);
    }
    return out;
  }

  // xmur3: string -> 32-bit hash (seed stretcher for short hex seeds).
  function xmur3(str) {
    var h = 1779033703 ^ str.length;
    for (var i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      return (h ^= h >>> 16) >>> 0;
    };
  }

  // mulberry32: 32-bit PRNG. Pure integer math (Math.imul + bit ops), so the
  // sequence is identical in every browser for the same seed state.
  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Deterministic PRNG for a seed: function () -> float in [0, 1).
  // Throws on invalid seeds — callers should validate first with
  // isValidSeed() when the seed comes from the URL.
  function createSeededRng(seed) {
    var s = normalizeSeed(seed);
    return mulberry32(xmur3('random-life-' + GENERATOR_VERSION + '-' + s)());
  }

  // Canonical path for a life, e.g. "/life/v1/7f3a2c91".
  function getLifeUrl(seed, version) {
    var v = version == null ? GENERATOR_VERSION : String(version);
    if (SUPPORTED_VERSIONS.indexOf(v) === -1) throw new Error('unsupported generator version: ' + v);
    return '/life/' + v + '/' + normalizeSeed(seed);
  }

  // Absolute URL for sharing (falls back to the path when location is
  // unavailable, e.g. non-browser contexts).
  function getAbsoluteLifeUrl(seed, version) {
    var path = getLifeUrl(seed, version);
    try {
      if (global.location && global.location.origin && global.location.origin !== 'null') {
        return global.location.origin + path;
      }
    } catch (e) { /* ignore */ }
    return path;
  }

  // Parse a pathname into:
  //   null                        -> plain homepage path ("/" or "")
  //   { version, seed }           -> valid share URL (seed lowercased)
  //   { invalid: true, reason }   -> /life/... path that is not usable
  // Never throws and never executes anything from the URL.
  function parseLifeUrl(pathname) {
    var path = typeof pathname === 'string'
      ? pathname
      : (global.location ? global.location.pathname : '/');
    if (path.length > 1) path = path.replace(/\/+$/, '');
    if (path === '' || path === '/') return null;
    var m = /^\/life\/([^\/]+)(?:\/([^\/]+))?$/.exec(path);
    if (!m) {
      return path.indexOf('/life') === 0 ? { invalid: true, reason: 'bad-path' } : null;
    }
    var version = m[1];
    var seed = m[2];
    if (SUPPORTED_VERSIONS.indexOf(version) === -1) {
      return { invalid: true, reason: 'unsupported-version' };
    }
    if (seed == null || seed === '') return { invalid: true, reason: 'missing-seed' };
    if (!isValidSeed(seed)) return { invalid: true, reason: 'bad-seed' };
    return { version: version, seed: seed.trim().toLowerCase() };
  }

  App.GENERATOR_VERSION = GENERATOR_VERSION;
  App.SUPPORTED_VERSIONS = SUPPORTED_VERSIONS;
  App.SEED_RE = SEED_RE;
  App.normalizeSeed = normalizeSeed;
  App.isValidSeed = isValidSeed;
  App.createSeed = createSeed;
  App.createSeededRng = createSeededRng;
  App.getLifeUrl = getLifeUrl;
  App.getAbsoluteLifeUrl = getAbsoluteLifeUrl;
  App.parseLifeUrl = parseLifeUrl;
})(typeof window !== 'undefined' ? window : this);

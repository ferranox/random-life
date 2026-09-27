/* app.js - boot:
 * 1. Register the service worker
 * 2. Load data
 * 3. Wire up the ui
 * 4. Handle shareable life URLs (/life/v1/<seed>) via the History API —
 *    no backend involved: the seed in the URL fully determines the life.
 */
(function (global) {
  'use strict';
  var App = global.App = global.App || {};

  function registerServiceWorker() {
    if (!('serviceWorker' in global.navigator)) return;
    if (global.location.protocol !== 'http:' && global.location.protocol !== 'https:') return;
    global.addEventListener('load', function () {
      global.navigator.serviceWorker.register('./sw.js').catch(function (err) {
        console.warn('Service worker registration failed:', err && err.message);
      });
    });
  }

  // Called by the UI's Generate buttons: new random seed -> deterministic
  // life -> push the canonical URL (no page reload).
  function generateNewLife() {
    var seed = App.createSeed();
    var person = App.generateLife(seed);
    pushLifeState(seed);
    return { person: person, seed: seed };
  }

  function pushLifeState(seed) {
    try {
      global.history.pushState({ seed: seed }, '', App.getLifeUrl(seed));
    } catch (e) { /* history API unavailable (file://, old browser) */ }
  }

  function replaceLifeState(seed) {
    try {
      var url = seed == null ? '/' : App.getLifeUrl(seed);
      global.history.replaceState({ seed: seed }, '', url);
    } catch (e) { /* ignore */ }
  }

  // Render the life for a known-good seed without touching history
  // (used by popstate navigation and initial URL loads). Never throws.
  function showSeededLife(seed, addToRecent) {
    if (!App.isValidSeed(seed)) return false;
    try {
      var person = App.generateLife(seed);
      App.displayLife(person, person.seed, { addToRecent: addToRecent !== false });
      return true;
    } catch (err) {
      console.warn('Could not display life for seed:', err && err.message);
      return false;
    }
  }

  // On initial page load: interpret the URL path. Returns true when a
  // shared life was displayed, false for plain/invalid homepage paths.
  // Must run after loadData() so the country dataset is ready.
  function loadLifeFromUrl() {
    var parsed;
    try {
      parsed = App.parseLifeUrl();
    } catch (err) {
      return false;
    }
    if (!parsed) {
      return false; // plain homepage: existing behaviour, generate nothing
    }
    if (parsed.invalid) {
      App.showHomepage();
      App.noteInvalidLifeUrl(parsed.reason);
      return false;
    }
    var ok = showSeededLife(parsed.seed);
    if (ok) {
      // Canonicalise (e.g. uppercase hex) without adding a history entry.
      replaceLifeState(parsed.seed);
      return true;
    }
    App.showHomepage();
    return false;
  }

  function noteInvalidLifeUrl(reason) {
    var msg = 'That life link looks invalid — showing the homepage. Press Generate for a new life.';
    if (reason === 'unsupported-version') {
      msg = 'That life link uses a newer generator version this page does not support yet.';
    }
    try {
      var el = global.document && global.document.getElementById('data-status');
      if (el) el.textContent = msg;
    } catch (e) { /* ignore */ }
  }

  function onPopState(e) {
    var state = (e && e.state) || {};
    if (state.seed != null) {
      // Back/Forward to a generated life: re-derive it from the seed.
      // No history entry added — it was already generated this session.
      if (!showSeededLife(state.seed, false)) App.showHomepage();
      return;
    }
    if (state.seed === null || state.seed === undefined) {
      // Back to the homepage entry (or a state-less entry): homepage view.
      // Re-parse the URL in case the state object is missing (some browsers
      // deliver null state for history entries predating this code).
      var parsed = null;
      try { parsed = App.parseLifeUrl(); } catch (err) { parsed = null; }
      if (parsed && !parsed.invalid) {
        showSeededLife(parsed.seed);
      } else {
        App.showHomepage();
      }
    }
  }

  function start() {
    registerServiceWorker();

    // If the page loaded a mix of old and new scripts (stale caches), say so
    // loudly instead of half-working (e.g. a dead Share button). Continue
    // best-effort afterwards — a warning beats silent breakage.
    checkScriptVersions();

    App.initUI(generateNewLife);
    try {
      global.addEventListener('popstate', onPopState);
    } catch (e) { /* ignore */ }

    App.loadData().then(function () {
      App.updateDataStatus();
      // Re-assert after the status update — updateDataStatus() would
      // otherwise clobber the mismatch warning set above.
      checkScriptVersions();
      // Display a shared life when the URL holds one; otherwise stay on the
      // homepage without generating anything.
      loadLifeFromUrl();
    }).catch(function (err) {
      console.warn('loadData failed:', err && err.message);
      App.updateDataStatus();
      checkScriptVersions();
      try { loadLifeFromUrl(); } catch (e) { /* ignore */ }
    });
  }

  App.generateNewLife = generateNewLife;
  App.loadLifeFromUrl = loadLifeFromUrl;
  App.noteInvalidLifeUrl = noteInvalidLifeUrl;
  App.checkScriptVersions = checkScriptVersions;

  // Every API the current index.html expects from the loaded scripts.
  // Missing entries mean stale files got mixed with fresh ones (browser,
  // edge or service-worker cache) — the classic symptom was a Share button
  // that silently did nothing. Returns true when everything is present.
  function checkScriptVersions() {
    var need = ['createSeed', 'createSeededRng', 'isValidSeed', 'parseLifeUrl',
      'getLifeUrl', 'getAbsoluteLifeUrl', 'generateLife', 'generatePerson',
      'getCountries', 'loadData', 'initUI', 'generateNewLife', 'loadLifeFromUrl',
      'displayLife', 'showHomepage', 'getCurrentSeed', 'shareLife'];
    var missing = need.filter(function (k) { return typeof App[k] !== 'function'; });
    if (!missing.length) return true;
    try {
      var doc = global.document;
      var el = doc && doc.getElementById('data-status');
      if (el) {
        el.textContent = 'This page loaded a mix of old and new files (' +
          missing.join(', ') + ' missing). Please hard-refresh ' +
          '(Ctrl+Shift+R / Cmd+Shift+R) to load the latest version.';
      }
      // Never leave a dead Share button on screen: hide it when its code
      // did not load.
      var sb = doc && doc.getElementById('share-btn');
      if (sb && typeof App.shareLife !== 'function') sb.hidden = true;
    } catch (e) { /* ignore */ }
    return false;
  }

  if (global.document.readyState === 'loading') {
    global.document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})(typeof window !== 'undefined' ? window : this);

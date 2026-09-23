/* app.js — entry point.
 * Classic script (no ES modules). Attaches to global App namespace.
 * 1. Register the service worker (only over http/https, not file://).
 * 2. Load data (live -> cache -> static).
 * 3. Wire up the UI.
 */
(function (global) {
  'use strict';
  var App = global.App = global.App || {};

  function registerServiceWorker() {
    if (!('serviceWorker' in global.navigator)) return;
    // SW cannot run from file:// — only register over http/https.
    if (global.location.protocol !== 'http:' && global.location.protocol !== 'https:') return;
    global.addEventListener('load', function () {
      global.navigator.serviceWorker.register('./sw.js').catch(function (err) {
        console.warn('Service worker registration failed:', err && err.message);
      });
    });
  }

  function generateCallback() {
    var countries = App.getCountries();
    return App.generatePerson(countries);
  }

  function start() {
    registerServiceWorker();

    // Initialise UI immediately with built-in data so it works even offline
    // / before the API resolves.
    App.initUI(generateCallback);

    // Attempt to upgrade to live/cached data in the background.
    App.loadData().then(function () {
      App.updateDataStatus();
    }).catch(function (err) {
      console.warn('loadData failed:', err && err.message);
      App.updateDataStatus();
    });
  }

  if (global.document.readyState === 'loading') {
    global.document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})(typeof window !== 'undefined' ? window : this);

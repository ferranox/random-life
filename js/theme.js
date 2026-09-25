/* theme.js - bro idk i found this js ages ago and use it everywhere. detects light/dark theme.
 */
(function (global) {
  'use strict';

  var root = global.document.documentElement;
  var query = global.matchMedia ? global.matchMedia('(prefers-color-scheme: dark)') : null;

  function apply() {
    var dark = !!(query && query.matches);
    root.setAttribute('data-theme', dark ? 'dark' : 'light');

    var meta = global.document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#000000' : '#ffffff');
  }

  apply();

  if (query) {
    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', apply);
    } else if (typeof query.addListener === 'function') {
      query.addListener(apply); // older Safari
    }
  }
})(window);

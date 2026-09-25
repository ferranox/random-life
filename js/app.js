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

  function generateCallback() {
    var countries = App.getCountries();
    return App.generatePerson(countries);
  }

  function start() {
    registerServiceWorker();

    App.initUI(generateCallback);

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

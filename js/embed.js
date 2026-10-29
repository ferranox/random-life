/* embed.js — shared helpers for the Embed feature.
 * Classic script (no bundler). Attaches to global App namespace.
 * Pure logic (no DOM) so both the main page dialog (via ui.js) and the
 * /embed/ page can reuse the exact same URL + snippet generation.
 *
 * Query-string convention:
 *   l{number}c = country slug (lowercase name, spaces removed, e.g. spain,
 *                unitedkingdom, bosniaandherzegovina)
 *   l{number}s = sex (m / f)
 *   l{number}h = habitation (u / r)
 *   lives=N    = explicit number of lives (2-5). Omitted for a single life.
 * Only non-default settings are included. A single default life has no query.
 */
(function (global) {
  'use strict';
  var App = global.App = global.App || {};

  var EMBED_BASE_URL = 'https://randomlife.fyi/embed';
  App.EMBED_BASE_URL = EMBED_BASE_URL;

  var STYLE_DEFAULTS = {
    widthMode: 'responsive',
    maxWidth: 900,
    fixedWidth: 900,
    height: 600,
    border: false,
    radius: 0
  };
  App.EMBED_STYLE_DEFAULTS = STYLE_DEFAULTS;

  function countrySlugFromName(name) {
    if (name == null) return '';
    return String(name).toLowerCase().replace(/\s+/g, '');
  }
  App.countrySlugFromName = countrySlugFromName;

  function codeToNameMap(countries) {
    var map = {};
    for (var i = 0; i < countries.length; i++) {
      var c = countries[i];
      if (c && c.code && c.name) map[String(c.code).toUpperCase()] = c.name;
    }
    return map;
  }

  function buildSlugToCode(countries) {
    var map = {};
    for (var i = 0; i < countries.length; i++) {
      var c = countries[i];
      if (!c || !c.code || !c.name) continue;
      var code = String(c.code).toUpperCase();
      var slug = countrySlugFromName(c.name);
      if (slug && !map[slug]) map[slug] = code;
      // Normalised fallback (strip punctuation) so slugs with or without
      // apostrophes, commas, periods, etc. all resolve.
      var norm = slug.replace(/[^a-z0-9]/g, '');
      if (norm && !map[norm]) map[norm] = code;
    }
    return map;
  }

  function countryCodeFromSlug(slug, countries) {
    if (slug == null) return null;
    var list = countries;
    if (!list) {
      try { list = App.getCountries ? App.getCountries() : []; }
      catch (e) { list = []; }
    }
    if (!list || !list.length) return null;
    var map = buildSlugToCode(list);
    var compact = String(slug).toLowerCase().replace(/\s+/g, '');
    if (map[compact]) return map[compact];
    var norm = compact.replace(/[^a-z0-9]/g, '');
    if (norm && map[norm]) return map[norm];
    return null;
  }
  App.countryCodeFromSlug = countryCodeFromSlug;

  function getCountryList() {
    try {
      if (App.getCountries) {
        var list = App.getCountries();
        if (list && list.length) return list;
      }
    } catch (e) { /* ignore */ }
    try {
      if (App.getStaticCountries) {
        var s = App.getStaticCountries();
        if (s && s.length) return s;
      }
    } catch (e2) { /* ignore */ }
    return [];
  }

  /* lifeConfigs: [{ country: CODE|'default', sex: 'male'|'female'|'default',
   *                 habitation: 'urban'|'rural'|'default' }, ...] */
  function buildEmbedUrl(lifeConfigs) {
    var configs = lifeConfigs && lifeConfigs.length ? lifeConfigs : [
      { country: 'default', sex: 'default', habitation: 'default' }
    ];
    var n = configs.length;
    if (n < 1) n = 1;
    if (n > 5) n = 5;
    var countries = getCountryList();
    var names = codeToNameMap(countries);
    var params = new URLSearchParams();
    if (n > 1) params.set('lives', String(n));
    for (var i = 0; i < n; i++) {
      var cfg = configs[i] || { country: 'default', sex: 'default', habitation: 'default' };
      var num = i + 1;
      var cc = cfg.country;
      if (cc != null && String(cc).toLowerCase() !== 'default' && String(cc) !== '') {
        var up = String(cc).toUpperCase();
        var nm = names[up];
        if (nm) {
          var slug = countrySlugFromName(nm);
          if (slug) params.set('l' + num + 'c', slug);
        }
      }
      if (cfg.sex === 'male') params.set('l' + num + 's', 'm');
      else if (cfg.sex === 'female') params.set('l' + num + 's', 'f');
      if (cfg.habitation === 'urban') params.set('l' + num + 'h', 'u');
      else if (cfg.habitation === 'rural') params.set('l' + num + 'h', 'r');
    }
    var qs = params.toString();
    return qs ? EMBED_BASE_URL + '?' + qs : EMBED_BASE_URL;
  }
  App.buildEmbedUrl = buildEmbedUrl;

  /* Parse an embed query string into life configs.
   * search: "?lives=2&l1c=spain", location.search, or a URLSearchParams.
   * Returns [{ country, sex, habitation }] with 'default' for missing settings.
   * - lives=N (1-5; spec uses 2-5, 1 accepted for robustness) sets the base count.
   * - The highest life index in l1..l5 params is also honoured, so URLs without
   *   lives=N keep working and a higher index is never ignored.
   */
  function parseEmbedParams(search, countries) {
    var params;
    try {
      if (search instanceof URLSearchParams) {
        params = new URLSearchParams(search.toString());
      } else if (search && typeof search.get === 'function' && typeof search.has === 'function') {
        params = new URLSearchParams(search.toString());
      } else if (typeof search === 'string') {
        var s = search;
        if (s.charAt(0) === '?') s = s.slice(1);
        params = new URLSearchParams(s);
      } else {
        params = new URLSearchParams('');
      }
    } catch (e) {
      params = new URLSearchParams('');
    }
    var list = countries || getCountryList();
    var livesN = null;
    if (params.has('lives')) {
      var raw = params.get('lives');
      var parsed = parseInt(String(raw), 10);
      if (parsed >= 1 && parsed <= 5) livesN = parsed;
    }
    var maxIdx = 0;
    try {
      params.forEach(function (value, key) {
        var m = /^l([1-5])([csh])$/.exec(key);
        if (m) {
          var idx = parseInt(m[1], 10);
          if (idx > maxIdx) maxIdx = idx;
        }
      });
    } catch (e2) { /* ignore */ }
    var numLives = 1;
    if (livesN != null) numLives = livesN;
    if (maxIdx > numLives) numLives = maxIdx;
    if (numLives < 1) numLives = 1;
    if (numLives > 5) numLives = 5;
    var configs = [];
    for (var i = 1; i <= numLives; i++) {
      var cRaw = params.get('l' + i + 'c');
      var sRaw = params.get('l' + i + 's');
      var hRaw = params.get('l' + i + 'h');
      var country = 'default';
      if (cRaw != null && cRaw !== '') {
        var code = countryCodeFromSlug(cRaw, list);
        if (code) country = code;
      }
      var sex = 'default';
      if (sRaw != null) {
        var sl = String(sRaw).toLowerCase();
        if (sl === 'm' || sl === 'male') sex = 'male';
        else if (sl === 'f' || sl === 'female') sex = 'female';
      }
      var hab = 'default';
      if (hRaw != null) {
        var hl = String(hRaw).toLowerCase();
        if (hl === 'u' || hl === 'urban') hab = 'urban';
        else if (hl === 'r' || hl === 'rural') hab = 'rural';
      }
      configs.push({ country: country, sex: sex, habitation: hab });
    }
    return configs;
  }
  App.parseEmbedParams = parseEmbedParams;

  function embedOverridesFromConfig(cfg) {
    return {
      countryCode: (!cfg || cfg.country === 'default') ? null : cfg.country,
      sex: (!cfg || cfg.sex === 'default') ? null : cfg.sex,
      habitation: (!cfg || cfg.habitation === 'default') ? null : cfg.habitation
    };
  }
  App.embedOverridesFromConfig = embedOverridesFromConfig;

  function clampInt(v, min, max, fallback) {
    var n = parseInt(v, 10);
    if (!isFinite(n)) return fallback;
    if (n < min) return min;
    if (n > max) return max;
    return n;
  }
  App.clampEmbedInt = clampInt;

  /* styleOpts: { widthMode: 'responsive'|'fixed', maxWidth, fixedWidth,
   *              height, border: bool, radius }.
   * Only the CSS properties needed for the selection are included, except the
   * always-present display/width/height/border baseline. Border-radius is
   * omitted when 0. max-width is only included for responsive mode.
   */
  function buildEmbedSnippet(embedUrl, styleOpts) {
    var opts = styleOpts || {};
    var widthMode = opts.widthMode === 'fixed' ? 'fixed' : 'responsive';
    var maxWidth = clampInt(opts.maxWidth, 100, 2000, STYLE_DEFAULTS.maxWidth);
    var fixedWidth = clampInt(opts.fixedWidth, 200, 2000, STYLE_DEFAULTS.fixedWidth);
    var height = clampInt(opts.height, 200, 2000, STYLE_DEFAULTS.height);
    var border = !!opts.border;
    var radius = clampInt(opts.radius, 0, 50, 0);
    var parts = ['display:block'];
    if (widthMode === 'fixed') {
      parts.push('width:' + fixedWidth + 'px');
    } else {
      parts.push('width:100%');
      parts.push('max-width:' + maxWidth + 'px');
    }
    parts.push('height:' + height + 'px');
    if (border) {
      parts.push('border:1px solid #dee2e6');
    } else {
      parts.push('border:0');
    }
    if (radius > 0) {
      parts.push('border-radius:' + radius + 'px');
    }
    var style = parts.join(';') + ';';
    var url = String(embedUrl);
    return '<iframe\n' +
      '  src="' + url + '"\n' +
      '  title="Random Life"\n' +
      '  loading="lazy"\n' +
      '  style="' + style + '"\n' +
      '></iframe>';
  }
  App.buildEmbedSnippet = buildEmbedSnippet;
})(typeof window !== 'undefined' ? window : this);

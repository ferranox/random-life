/* data.js - country dataset, live World Bank overlay, and model constants
 * Where the numbers come from (details, releases, reference years and licences
 * are in the Data & Methodology dialog and in the header of js/dataset.js):
 *   - Built-in snapshot (js/dataset.js, built by tools/update-data.py, loaded
 *     before this file so the first Generate works with no network):
 *       UN WPP 2024  - population, female share, single-year age distribution,
 *                      total fertility rate, life expectancy at birth by sex
 *       UN WUP 2025  - urban share (national definitions)
 *       ILOSTAT      - employment by sector (agriculture / industry / services)
 *                      and unemployment rate (ILO modelled estimates)
 *       World Bank   - GDP per capita, electricity, drinking water, sanitation,
 *                      internet use, income group, region (latest values)
 *     The WPP / WUP / ILO values are snapshot-only and are never overwritten.
 *   - Live (browser -> World Bank API, cached for 12 h): only the World Bank
 *     owned variables above. Each variable is validated and applied on its own;
 *     anything that fails keeps its snapshot value.
 *   - Flags are derived from the ISO code, so no per-country flag data is kept.
 */
(function (global) {
  'use strict';
  var App = global.App = global.App || {};

  // 1. display-name / region / name-culture overrides, keyed by country code.
  // [display name, region label, name culture]. Countries not listed use the
  // World Bank name and region, and a name culture inferred from the region.
  var OVERRIDES = {
    IN: ['India', 'Asia', 'south_asian'],
    CN: ['China', 'Asia', 'east_asian'],
    US: ['United States', 'North America', 'north_american_oceanian'],
    ID: ['Indonesia', 'Asia', 'southeast_asian'],
    PK: ['Pakistan', 'Asia', 'south_asian'],
    BR: ['Brazil', 'South America', 'latin_american'],
    NG: ['Nigeria', 'Africa', 'sub_saharan'],
    BD: ['Bangladesh', 'Asia', 'south_asian'],
    RU: ['Russia', 'Europe', 'slavic'],
    ET: ['Ethiopia', 'Africa', 'sub_saharan'],
    MX: ['Mexico', 'North America', 'latin_american'],
    JP: ['Japan', 'Asia', 'east_asian'],
    PH: ['Philippines', 'Asia', 'southeast_asian'],
    CD: ['DR Congo', 'Africa', 'sub_saharan'],
    EG: ['Egypt', 'Africa', 'arab_middle_east'],
    DE: ['Germany', 'Europe', 'west_european'],
    TZ: ['Tanzania', 'Africa', 'sub_saharan'],
    TR: ['Turkey', 'Asia', 'arab_middle_east'],
    TH: ['Thailand', 'Asia', 'southeast_asian'],
    GB: ['United Kingdom', 'Europe', 'west_european'],
    FR: ['France', 'Europe', 'west_european'],
    KE: ['Kenya', 'Africa', 'sub_saharan'],
    IT: ['Italy', 'Europe', 'west_european'],
    CO: ['Colombia', 'South America', 'latin_american'],
    ES: ['Spain', 'Europe', 'west_european'],
    UG: ['Uganda', 'Africa', 'sub_saharan'],
    AR: ['Argentina', 'South America', 'latin_american'],
    DZ: ['Algeria', 'Africa', 'arab_middle_east'],
    SD: ['Sudan', 'Africa', 'arab_middle_east'],
    IQ: ['Iraq', 'Asia', 'arab_middle_east'],
    AF: ['Afghanistan', 'Asia', 'south_asian'],
    PL: ['Poland', 'Europe', 'east_european'],
    CA: ['Canada', 'North America', 'north_american_oceanian'],
    MA: ['Morocco', 'Africa', 'arab_middle_east'],
    SA: ['Saudi Arabia', 'Asia', 'arab_middle_east'],
    PE: ['Peru', 'South America', 'latin_american'],
    UZ: ['Uzbekistan', 'Asia', 'slavic'],
    MY: ['Malaysia', 'Asia', 'southeast_asian'],
    VE: ['Venezuela', 'South America', 'latin_american'],
    MZ: ['Mozambique', 'Africa', 'sub_saharan'],
    GH: ['Ghana', 'Africa', 'sub_saharan'],
    YE: ['Yemen', 'Asia', 'arab_middle_east'],
    NP: ['Nepal', 'Asia', 'south_asian'],
    CM: ['Cameroon', 'Africa', 'sub_saharan'],
    CI: ["Cote d'Ivoire", 'Africa', 'sub_saharan'],
    AU: ['Australia', 'Oceania', 'north_american_oceanian'],
    NE: ['Niger', 'Africa', 'sub_saharan'],
    TW: ['Taiwan', 'Asia', 'east_asian'],
    ML: ['Mali', 'Africa', 'sub_saharan'],
    BF: ['Burkina Faso', 'Africa', 'sub_saharan'],
    MW: ['Malawi', 'Africa', 'sub_saharan'],
    SY: ['Syria', 'Asia', 'arab_middle_east'],
    ZW: ['Zimbabwe', 'Africa', 'sub_saharan'],
    RO: ['Romania', 'Europe', 'east_european'],
    VN: ['Vietnam', 'Asia', 'southeast_asian'],
    KR: ['South Korea', 'Asia', 'east_asian'],
    MM: ['Myanmar', 'Asia', 'southeast_asian'],
    ZA: ['South Africa', 'Africa', 'sub_saharan'],
    IR: ['Iran', 'Asia', 'arab_middle_east'],
    UA: ['Ukraine', 'Europe', 'slavic'],
    AO: ['Angola', 'Africa', 'sub_saharan'],
    CL: ['Chile', 'South America', 'latin_american'],
    KZ: ['Kazakhstan', 'Asia', 'slavic'],
    ZM: ['Zambia', 'Africa', 'sub_saharan'],
    SN: ['Senegal', 'Africa', 'sub_saharan'],
    GT: ['Guatemala', 'North America', 'latin_american'],
    BO: ['Bolivia', 'South America', 'latin_american'],
    HT: ['Haiti', 'North America', 'latin_american'],
    EC: ['Ecuador', 'South America', 'latin_american'],
    KH: ['Cambodia', 'Asia', 'southeast_asian'],
    HN: ['Honduras', 'North America', 'latin_american'],
    PG: ['Papua New Guinea', 'Oceania', 'southeast_asian'],
    RW: ['Rwanda', 'Africa', 'sub_saharan'],
    BJ: ['Benin', 'Africa', 'sub_saharan'],
    TN: ['Tunisia', 'Africa', 'arab_middle_east'],
    SO: ['Somalia', 'Africa', 'sub_saharan'],
    PT: ['Portugal', 'Europe', 'west_european'],
    CZ: ['Czechia', 'Europe', 'east_european'],
    GR: ['Greece', 'Europe', 'west_european'],
    JO: ['Jordan', 'Asia', 'arab_middle_east'],
    BE: ['Belgium', 'Europe', 'west_european'],
    NL: ['Netherlands', 'Europe', 'west_european'],
    SE: ['Sweden', 'Europe', 'west_european'],
    CH: ['Switzerland', 'Europe', 'west_european'],
    AT: ['Austria', 'Europe', 'west_european'],
    IL: ['Israel', 'Asia', 'arab_middle_east'],
    NO: ['Norway', 'Europe', 'west_european'],
    AE: ['United Arab Emirates', 'Asia', 'arab_middle_east'],
    SG: ['Singapore', 'Asia', 'east_asian']
  };

  // World Bank income Level id -> our income group.
  var INCOME_MAP = { LIC: 'L', LMC: 'LM', UMC: 'UM', HIC: 'H' };

  // Flag emoji derived from any ISO2 code - no per-country flag data needed.
  function flagEmoji(iso2) {
    if (typeof iso2 !== 'string' || !/^[A-Za-z]{2}$/.test(iso2)) return '';
    var up = iso2.toUpperCase();
    return String.fromCodePoint(up.charCodeAt(0) + 127397, up.charCodeAt(1) + 127397);
  }

  // Illustrative name culture for live-only countries (those without a static
  // entry), inferred from the World Bank region. ECS uses income as a tiebreak.
  function cultureForRegion(regionId, incomeGroup) {
    switch (regionId) {
      case 'SAS': return 'south_asian';
      case 'SSF': return 'sub_saharan';
      case 'LCN': return 'latin_american';
      case 'MEA': return 'arab_middle_east';
      case 'EAS': return 'southeast_asian';
      case 'NAC': return 'north_american_oceanian';
      case 'ECS': return incomeGroup === 'H' ? 'west_european' : 'east_european';
      default: return 'north_american_oceanian';
    }
  }

  // 3. model constants: age bands/weights. These six-band tables are no longer
  // the normal age model (that is the single-year WPP distribution, ageDist);
  // they remain only as the documented fallback for a country without one.
  var AGE_BANDS = [
    { min: 0, max: 4 },
    { min: 5, max: 14 },
    { min: 15, max: 24 },
    { min: 25, max: 54 },
    { min: 55, max: 64 },
    { min: 65, max: 100 }
  ];

  var AGE_WEIGHTS = {
    L: [0.150, 0.225, 0.195, 0.285, 0.080, 0.065],
    LM: [0.115, 0.195, 0.185, 0.330, 0.090, 0.085],
    UM: [0.080, 0.145, 0.150, 0.385, 0.125, 0.115],
    H: [0.050, 0.115, 0.115, 0.375, 0.145, 0.200]
  };

  // 4. occupations
  var OCCUPATIONS = [
    // Agriculture
    { id: 'subsistence_farmer', name: 'Subsistence farmer', icon: '\uD83C\uDF3E', category: 'Agriculture', minAge: 15, maxAge: 74, weights: { L: 35, LM: 18, UM: 5, H: 0 }, incomeRatio: [0.12, 0.35], habitat: 'rural' },
    { id: 'commercial_farmer', name: 'Commercial farmer', icon: '\uD83D\uDE9C', category: 'Agriculture', minAge: 20, maxAge: 69, weights: { L: 6, LM: 8, UM: 5, H: 3 }, incomeRatio: [0.45, 1.00], habitat: 'rural' },
    { id: 'fisherman', name: 'Fisher', icon: '\uD83C\uDFA3', category: 'Agriculture', minAge: 16, maxAge: 64, weights: { L: 3, LM: 4, UM: 2, H: 1 }, incomeRatio: [0.20, 0.65], habitat: null },
    { id: 'herder', name: 'Herder', icon: '\uD83D\uDC04', category: 'Agriculture', minAge: 12, maxAge: 65, weights: { L: 5, LM: 3, UM: 1, H: 0 }, incomeRatio: [0.10, 0.30], habitat: 'rural' },
    // Industry
    { id: 'factory_worker', name: 'Factory worker', icon: '\uD83C\uDFED', category: 'Industry', minAge: 16, maxAge: 64, weights: { L: 4, LM: 12, UM: 10, H: 4 }, incomeRatio: [0.50, 1.00], habitat: 'urban' },
    { id: 'construction_worker', name: 'Construction worker', icon: '\uD83D\uDC77', category: 'Industry', minAge: 18, maxAge: 60, weights: { L: 5, LM: 8, UM: 8, H: 4 }, incomeRatio: [0.40, 0.90], habitat: null },
    { id: 'mine_worker', name: 'Mine worker', icon: '\u26CF\uFE0F', category: 'Industry', minAge: 18, maxAge: 55, weights: { L: 2, LM: 3, UM: 2, H: 1 }, incomeRatio: [0.50, 1.00], habitat: 'rural' },
    // Services (low)
    { id: 'domestic_worker', name: 'Domestic worker', icon: '\uD83E\uDDF9', category: 'Services', minAge: 15, maxAge: 60, weights: { L: 5, LM: 6, UM: 3, H: 1 }, incomeRatio: [0.12, 0.35], habitat: 'urban' },
    { id: 'street_vendor', name: 'Street vendor', icon: '\uD83D\uDED2', category: 'Services', minAge: 15, maxAge: 65, weights: { L: 8, LM: 7, UM: 3, H: 0 }, incomeRatio: [0.10, 0.30], habitat: 'urban' },
    { id: 'driver', name: 'Driver', icon: '\uD83D\uDE95', category: 'Services', minAge: 20, maxAge: 65, weights: { L: 3, LM: 5, UM: 5, H: 3 }, incomeRatio: [0.40, 0.85], habitat: null },
    { id: 'retail_worker', name: 'Retail worker', icon: '\uD83D\uDECD\uFE0F', category: 'Services', minAge: 16, maxAge: 65, weights: { L: 2, LM: 5, UM: 7, H: 6 }, incomeRatio: [0.45, 0.90], habitat: 'urban' },
    { id: 'food_service', name: 'Restaurant worker', icon: '\uD83C\uDF7D\uFE0F', category: 'Services', minAge: 16, maxAge: 60, weights: { L: 2, LM: 4, UM: 5, H: 5 }, incomeRatio: [0.40, 0.80], habitat: 'urban' },
    { id: 'market_trader', name: 'Market trader', icon: '\uD83C\uDFEA', category: 'Services', minAge: 18, maxAge: 65, weights: { L: 5, LM: 6, UM: 3, H: 1 }, incomeRatio: [0.20, 0.60], habitat: null },
    // Services (mid)
    { id: 'security_guard', name: 'Security guard', icon: '\uD83D\uDEE1\uFE0F', category: 'Services', minAge: 20, maxAge: 60, weights: { L: 2, LM: 3, UM: 3, H: 2 }, incomeRatio: [0.50, 0.95], habitat: null },
    { id: 'office_worker', name: 'Office worker', icon: '\uD83D\uDCBC', category: 'Services', minAge: 20, maxAge: 65, weights: { L: 1, LM: 4, UM: 7, H: 7 }, incomeRatio: [0.70, 1.30], habitat: 'urban' },
    { id: 'government_worker', name: 'Government worker', icon: '\uD83C\uDFDB\uFE0F', category: 'Public sector', minAge: 22, maxAge: 65, weights: { L: 2, LM: 4, UM: 4, H: 4 }, incomeRatio: [0.80, 1.50], habitat: null },
    { id: 'teacher', name: 'Teacher', icon: '\uD83D\uDCDA', category: 'Education', minAge: 22, maxAge: 65, weights: { L: 3, LM: 5, UM: 5, H: 5 }, incomeRatio: [0.65, 1.30], habitat: null },
    { id: 'nurse', name: 'Nurse', icon: '\uD83C\uDFE5', category: 'Health', minAge: 22, maxAge: 65, weights: { L: 1, LM: 3, UM: 4, H: 5 }, incomeRatio: [0.75, 1.50], habitat: 'urban' },
    { id: 'small_business_owner', name: 'Business owner', icon: '\uD83C\uDFE2', category: 'Business', minAge: 20, maxAge: 70, weights: { L: 3, LM: 4, UM: 5, H: 4 }, incomeRatio: [0.50, 2.50], habitat: null },
    // Professional
    { id: 'engineer', name: 'Engineer', icon: '\u2699\uFE0F', category: 'Professional', minAge: 23, maxAge: 65, weights: { L: 0, LM: 2, UM: 4, H: 6 }, incomeRatio: [1.20, 2.80], habitat: 'urban' },
    { id: 'doctor', name: 'Doctor', icon: '\uD83D\uDC68\u200D\u2695\uFE0F', category: 'Health', minAge: 27, maxAge: 68, weights: { L: 0, LM: 1, UM: 2, H: 3 }, incomeRatio: [2.20, 5.50], habitat: 'urban' },
    { id: 'it_professional', name: 'IT worker', icon: '\uD83D\uDCBB', category: 'Professional', minAge: 22, maxAge: 55, weights: { L: 0, LM: 1, UM: 3, H: 6 }, incomeRatio: [1.50, 4.50], habitat: 'urban' },
    { id: 'business_professional', name: 'Business worker', icon: '\uD83D\uDCCA', category: 'Business', minAge: 24, maxAge: 65, weights: { L: 0, LM: 1, UM: 3, H: 5 }, incomeRatio: [1.40, 4.00], habitat: 'urban' },
    { id: 'lawyer', name: 'Lawyer', icon: '\u2696\uFE0F', category: 'Professional', minAge: 25, maxAge: 68, weights: { L: 0, LM: 1, UM: 2, H: 3 }, incomeRatio: [1.50, 5.00], habitat: 'urban' },
    { id: 'artist_creative', name: 'Artist', icon: '\uD83C\uDFA8', category: 'Creative', minAge: 18, maxAge: 65, weights: { L: 1, LM: 2, UM: 3, H: 3 }, incomeRatio: [0.40, 2.00], habitat: null },
    { id: 'craftsperson', name: 'Artisan', icon: '\uD83D\uDD28', category: 'Crafts', minAge: 18, maxAge: 65, weights: { L: 4, LM: 5, UM: 3, H: 2 }, incomeRatio: [0.30, 0.80], habitat: null },
    // Non-working
    { id: 'unemployed', name: 'Unemployed', icon: '\uD83D\uDCCB', category: 'Not employed', minAge: 16, maxAge: 65, weights: { L: 4, LM: 5, UM: 4, H: 3 }, incomeRatio: [0, 0.05], habitat: null },
    { id: 'homemaker', name: 'Homemaker', icon: '\uD83C\uDFE0', category: 'Not employed', minAge: 18, maxAge: 70, weights: { L: 12, LM: 9, UM: 5, H: 3 }, incomeRatio: [0, 0], habitat: null }
  ];

  // 5. habitation definitions (by income group)
  var HABITATION = {
    rural: {
      L: [['Mud / earthen home', 45], ['Basic rural house', 35], ['Traditional village house', 20]],
      LM: [['Basic rural house', 40], ['Traditional village house', 35], ['Small concrete house', 25]],
      UM: [['Rural farmhouse', 35], ['Village house', 40], ['Modest rural home', 25]],
      H: [['Farmhouse', 35], ['Rural / suburban house', 45], ['Country home', 20]]
    },
    urban: {
      L: [['Informal settlement / slum', 50], ['Overcrowded shared room', 30], ['Basic urban dwelling', 20]],
      LM: [['Informal settlement', 25], ['Shared rented room', 30], ['Basic apartment', 35], ['Modest house', 10]],
      UM: [['Small apartment', 30], ['Standard apartment', 35], ['Townhouse / row house', 20], ['Suburban house', 15]],
      H: [['Standard apartment', 20], ['Modern apartment', 30], ['Suburban house', 25], ['Detached house', 20], ['Large family home', 5]]
    }
  };

  // 6. data: built-in snapshot, live World Bank overlay, status, cache
  var SNAPSHOT = App.SNAPSHOT || null;
  var DATA_LOAD_STATUS = { source: 'static', message: 'Using built-in data', loading: false };
  var CACHE_KEY = 'randomLife.countries.v6';
  var OLD_CACHE_KEYS = ['randomLife.countries.v5'];
  var CACHE_TTL = 1000 * 60 * 60 * 12; // 12 hours
  var FETCH_TIMEOUT = 20000;           // ms; a hung request falls back per variable

  // The only variables a live World Bank response may touch (World Bank owned).
  // Everything else (UN WPP / UN WUP / ILO) is snapshot-only.
  var WB_INDICATORS = {
    gdpPc: 'NY.GDP.PCAP.CD',
    elec: 'EG.ELC.ACCS.ZS',
    water: 'SH.H2O.BASW.ZS',
    sanit: 'SH.STA.BASS.ZS',
    net: 'IT.NET.USER.ZS'
  };
  var WB_FIELDS = Object.keys(WB_INDICATORS);
  var WB_DATASETS = WB_FIELDS.length + 1; // five indicators + country metadata

  // Plausible ranges used to validate every number before it is used.
  var RANGES = {
    pop: [1, 3e9], femaleShare: [5, 95], leM: [20, 100], leF: [20, 105], urban: [0, 100],
    fert: [0, 12], agrShare: [0, 100], indShare: [0, 100], srvShare: [0, 100],
    unemp: [0, 100], gdpPc: [1, 1000000], elec: [0, 100.5], water: [0, 100.5],
    sanit: [0, 100.5], net: [0, 100.5], age014: [0, 100], age65: [0, 100]
  };
  var NUMERIC_FIELDS = ['pop', 'femaleShare', 'leM', 'leF', 'urban', 'fert', 'agrShare',
    'indShare', 'srvShare', 'unemp', 'gdpPc', 'elec', 'water', 'sanit', 'net', 'age014', 'age65'];
  var AGE_COUNT = 101;

  function inRange(v, field) {
    var r = RANGES[field];
    return typeof v === 'number' && isFinite(v) && v >= r[0] && v <= r[1];
  }

  // Single-year age distribution: 101 finite non-negative numbers (ages 0..100,
  // 100 = 100+) normalised to sum to 1. Returns null when invalid, which makes
  // the generator use the 6-band fallback for that country.
  function normaliseAgeDist(arr, scale) {
    if (!Array.isArray(arr) || arr.length !== AGE_COUNT) return null;
    var sum = 0, i;
    for (i = 0; i < AGE_COUNT; i++) {
      var v = arr[i];
      if (typeof v !== 'number' || !isFinite(v) || v < 0) return null;
      sum += v;
    }
    if (!(sum > 0)) return null;
    if (scale && Math.abs(sum - scale) / scale > 0.01) return null;
    var dist = new Array(AGE_COUNT);
    for (i = 0; i < AGE_COUNT; i++) dist[i] = arr[i] / sum;
    return dist;
  }

  function validIncomeGroup(g) {
    return g === 'L' || g === 'LM' || g === 'UM' || g === 'H';
  }

  function copyCountry(c) {
    var copy = {};
    for (var p in c) { if (Object.prototype.hasOwnProperty.call(c, p)) copy[p] = c[p]; }
    return copy;
  }

  // One built-in country object from one snapshot record. Field names are the
  // ones the generator and UI already read.
  function countryFromRecord(rec, scale) {
    var code = String(rec.code).toUpperCase();
    var over = OVERRIDES[code];
    var incomeGroup = validIncomeGroup(rec.incomeGroup) ? rec.incomeGroup : 'LM';
    var c = {
      code: code,
      name: over ? over[0] : String(rec.name),
      incomeGroup: incomeGroup,
      region: over ? over[1] : (rec.region ? String(rec.region) : 'Unknown'),
      culture: over ? over[2] : cultureForRegion(rec.rid, incomeGroup),
      rid: rec.rid || null,
      flag: flagEmoji(code),
      ageDist: normaliseAgeDist(rec.age, scale)
    };
    NUMERIC_FIELDS.forEach(function (f) {
      c[f] = inRange(rec[f], f) ? rec[f] : null;
    });
    return c;
  }

  function buildSnapshotCountries() {
    if (!SNAPSHOT || !Array.isArray(SNAPSHOT.countries)) return [];
    var scale = SNAPSHOT.meta && SNAPSHOT.meta.ageQuantisation;
    var seen = {};
    var list = [];
    SNAPSHOT.countries.forEach(function (rec) {
      if (!rec || typeof rec.code !== 'string' || !/^[A-Za-z]{2}$/.test(rec.code)) return;
      var c = countryFromRecord(rec, scale);
      // Never produce a person from a country without a usable population.
      if (!(c.pop > 0) || seen[c.code]) return;
      seen[c.code] = true;
      list.push(c);
    });
    return list;
  }

  // The built-in list, kept pristine; _countries is this list plus any live overlay.
  var STATIC_COUNTRIES = buildSnapshotCountries();
  var _countries = STATIC_COUNTRIES.slice();

  function knownCodes() {
    var known = {};
    STATIC_COUNTRIES.forEach(function (c) { known[c.code] = true; });
    return known;
  }

  // ---- status wording (truthful about the real mix) ----
  function snapshotLabel() {
    var parts = [];
    var sources = SNAPSHOT && SNAPSHOT.meta && SNAPSHOT.meta.sources;
    if (Array.isArray(sources)) {
      sources.forEach(function (s) { if (s && s.id !== 'wb' && s.short) parts.push(s.short); });
    }
    return parts.length ? parts.join(', ') : 'UN and ILO data';
  }

  function snapshotDate() {
    return (SNAPSHOT && SNAPSHOT.meta && SNAPSHOT.meta.generated) || 'unknown date';
  }

  function staticMessage() {
    return 'Using built-in snapshot: ' + snapshotLabel() + ', World Bank (retrieved ' + snapshotDate() + ')';
  }

  function overlayCount(overlay) {
    return (overlay.vars ? overlay.vars.length : 0) + (overlay.metaOk ? 1 : 0);
  }

  function liveMessage(overlay, cached) {
    var n = overlayCount(overlay);
    var what = n >= WB_DATASETS ? 'World Bank data' :
      'World Bank data (' + n + ' of ' + WB_DATASETS + ' datasets)';
    return 'Using ' + (cached ? 'cached ' : 'live ') + what + ' with built-in snapshot: ' + snapshotLabel();
  }

  // ---- live World Bank overlay ----
  // overlay = { ts, vars: ['gdpPc', ...], values: { gdpPc: { IN: 2411, ... } },
  //             metaOk: bool, meta: { IN: { incomeGroup, region, rid } } }
  function wbUrl(indicator) {
    return 'https://api.worldbank.org/v2/country/all/indicator/' + indicator +
      '?format=json&mrv=5&per_page=1500';
  }

  function fetchJson(url) {
    var opts = {};
    var timer = null;
    if (typeof AbortController === 'function') {
      var ctl = new AbortController();
      opts.signal = ctl.signal;
      timer = setTimeout(function () { ctl.abort(); }, FETCH_TIMEOUT);
    }
    function done() { if (timer) clearTimeout(timer); }
    return fetch(url, opts).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }).then(function (json) { done(); return json; }, function (err) { done(); throw err; });
  }

  // Same rounding the live fetch has always applied (whole numbers).
  function roundLive(field, v) {
    var r = Math.round(v);
    return (field !== 'gdpPc' && r > 100) ? 100 : r;
  }

  // Validate one indicator response; throws when it is not usable.
  function parseIndicator(field, json, known) {
    var ind = WB_INDICATORS[field];
    if (!Array.isArray(json) || json.length < 2 || !Array.isArray(json[1])) {
      throw new Error('unexpected response shape');
    }
    var map = {};
    var good = 0, bad = 0;
    json[1].forEach(function (row) {
      if (!row || !row.country || typeof row.country.id !== 'string' ||
          !row.indicator || row.indicator.id !== ind) { bad++; return; }
      var code = row.country.id.toUpperCase();
      if (!known[code]) return;            // aggregates / unknown codes are ignored
      if (row.value == null) return;       // a missing value is normal
      var v = row.value;
      if (!inRange(v, field)) { bad++; return; }
      if (map[code] === undefined) { map[code] = roundLive(field, v); good++; }
    });
    if (bad > 0 && bad > 0.05 * (good + bad)) throw new Error('too many invalid values');
    if (good < 100) throw new Error('too few countries (' + good + ')');
    return map;
  }

  // Validate the country metadata (income group, region); throws when unusable.
  function parseMeta(json, known) {
    if (!Array.isArray(json) || json.length < 2 || !Array.isArray(json[1])) {
      throw new Error('unexpected response shape');
    }
    var meta = {};
    var good = 0;
    json[1].forEach(function (m) {
      if (!m || typeof m.iso2Code !== 'string' || !/^[A-Za-z]{2}$/.test(m.iso2Code)) return;
      var code = m.iso2Code.toUpperCase();
      if (!known[code] || meta[code]) return;
      var ig = m.incomeLevel && INCOME_MAP[m.incomeLevel.id];
      if (!ig) return;
      var entry = { incomeGroup: ig };
      if (m.region && typeof m.region.value === 'string' && m.region.value.trim() &&
          m.region.value.length <= 80 && typeof m.region.id === 'string' && /^[A-Z]{3}$/.test(m.region.id)) {
        entry.region = m.region.value.trim();
        entry.rid = m.region.id;
      }
      meta[code] = entry;
      good++;
    });
    if (good < 100) throw new Error('too few countries (' + good + ')');
    return meta;
  }

  // Merge an overlay onto the built-in list. Every value is validated again here
  // (so a corrupt cache entry cannot inject bad data) and applied per variable.
  function applyOverlay(overlay) {
    var base = STATIC_COUNTRIES;
    var merged = base.map(function (c) {
      var copy = copyCountry(c);
      var code = c.code;
      WB_FIELDS.forEach(function (f) {
        var layer = overlay.values && overlay.values[f];
        var v = layer && layer[code];
        if (inRange(v, f)) copy[f] = roundLive(f, v);
      });
      var m = overlay.metaOk && overlay.meta && overlay.meta[code];
      if (m) {
        if (validIncomeGroup(m.incomeGroup)) copy.incomeGroup = m.incomeGroup;
        if (!OVERRIDES[code]) {
          if (typeof m.region === 'string' && m.region) copy.region = m.region;
          if (typeof m.rid === 'string' && /^[A-Z]{3}$/.test(m.rid)) copy.rid = m.rid;
          copy.culture = cultureForRegion(copy.rid, copy.incomeGroup);
        }
      }
      return copy;
    });
    return merged;
  }

  // Fetch the World Bank datasets independently; resolve to an overlay holding
  // whatever validated, or null when nothing did.
  function fetchOverlay() {
    var known = knownCodes();
    var jobs = WB_FIELDS.map(function (f) {
      return fetchJson(wbUrl(WB_INDICATORS[f])).then(function (json) {
        return parseIndicator(f, json, known);
      });
    });
    jobs.push(fetchJson('https://api.worldbank.org/v2/country?format=json&per_page=300').then(function (json) {
      return parseMeta(json, known);
    }));
    return Promise.allSettled(jobs).then(function (results) {
      var overlay = { ts: Date.now(), vars: [], values: {}, metaOk: false, meta: {} };
      results.forEach(function (r, i) {
        var isMeta = i === WB_FIELDS.length;
        if (r.status === 'fulfilled') {
          if (isMeta) { overlay.metaOk = true; overlay.meta = r.value; }
          else { overlay.vars.push(WB_FIELDS[i]); overlay.values[WB_FIELDS[i]] = r.value; }
        } else {
          console.warn('World Bank ' + (isMeta ? 'country list' : 'indicator ' + WB_FIELDS[i]) +
            ' not used (built-in value kept):', r.reason && r.reason.message);
        }
      });
      return overlayCount(overlay) > 0 ? overlay : null;
    }).catch(function (err) {
      console.warn('fetchLiveData failed:', err && err.message);
      return null;
    });
  }

  // Kept for compatibility: resolves to the merged country list, or null.
  function fetchLiveData() {
    return fetchOverlay().then(function (overlay) {
      return overlay ? applyOverlay(overlay) : null;
    });
  }

  // Persistent cache (localStorage, with sessionStorage fallback) holding only
  // the validated World Bank overlay, so live values survive reloads.
  function storage() {
    try { if (global.localStorage) return global.localStorage; } catch (e) { /* unavailable */ }
    try { if (global.sessionStorage) return global.sessionStorage; } catch (e) { /* unavailable */ }
    return null;
  }

  function clearOldCaches() {
    try {
      var store = storage();
      if (store) OLD_CACHE_KEYS.forEach(function (k) { store.removeItem(k); });
    } catch (e) { /* storage may be unavailable */ }
  }

  function readCache() {
    try {
      var store = storage();
      var raw = store && store.getItem(CACHE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed.ts !== 'number' || !parsed.values || !Array.isArray(parsed.vars)) return null;
      if (Date.now() - parsed.ts > CACHE_TTL) return null;
      return parsed;
    } catch (e) {
      return null;
    }
  }

  function writeCache(overlay) {
    try {
      var store = storage();
      if (store) store.setItem(CACHE_KEY, JSON.stringify(overlay));
    } catch (e) { /* storage may be unavailable (private mode / file://) */ }
  }

  function useStatic() {
    _countries = STATIC_COUNTRIES.slice();
    DATA_LOAD_STATUS.source = 'static';
    DATA_LOAD_STATUS.message = staticMessage();
    DATA_LOAD_STATUS.loading = false;
  }

  function loadData() {
    DATA_LOAD_STATUS.loading = true;
    clearOldCaches();

    // 1. try persistent cache first...
    var cached = readCache();
    if (cached) {
      var cachedOverlay = {
        ts: cached.ts,
        vars: cached.vars.filter(function (f) { return WB_FIELDS.indexOf(f) !== -1; }),
        values: cached.values,
        metaOk: cached.metaOk === true,
        meta: cached.meta || {}
      };
      if (overlayCount(cachedOverlay) > 0) {
        _countries = applyOverlay(cachedOverlay);
        DATA_LOAD_STATUS.source = 'cached';
        DATA_LOAD_STATUS.message = liveMessage(cachedOverlay, true);
        DATA_LOAD_STATUS.loading = false;
        return Promise.resolve(_countries);
      }
    }

    // 2. try live api...
    return fetchOverlay().then(function (overlay) {
      if (overlay) {
        _countries = applyOverlay(overlay);
        writeCache(overlay);
        DATA_LOAD_STATUS.source = 'live';
        DATA_LOAD_STATUS.message = liveMessage(overlay, false);
        DATA_LOAD_STATUS.loading = false;
      } else {
        useStatic();
      }
      return _countries;
    }).catch(function () {
      useStatic();
      return _countries;
    });
  }

  if (!_countries.length) {
    DATA_LOAD_STATUS.message = 'Built-in data snapshot is missing';
  } else {
    DATA_LOAD_STATUS.message = staticMessage();
  }

  function getCountries() {
    return _countries;
  }

  function getStaticCountries() {
    return STATIC_COUNTRIES;
  }

  // expose on namespace
  App.STATIC_COUNTRIES = STATIC_COUNTRIES;
  App.AGE_BANDS = AGE_BANDS;
  App.AGE_WEIGHTS = AGE_WEIGHTS;
  App.OCCUPATIONS = OCCUPATIONS;
  App.HABITATION = HABITATION;
  App.DATA_LOAD_STATUS = DATA_LOAD_STATUS;
  App.flagEmoji = flagEmoji;
  App.cultureForRegion = cultureForRegion;
  App.fetchLiveData = fetchLiveData;
  App.loadData = loadData;
  App.getCountries = getCountries;
  App.getStaticCountries = getStaticCountries;
})(typeof window !== 'undefined' ? window : this);

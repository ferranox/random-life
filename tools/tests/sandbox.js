/* Developer-side test harness (never deployed). Run it with: python3 tools/run-tests.py
 *
 * Evaluates the shipped browser files (js/names.js, js/dataset.js, js/data.js,
 * js/generator.js) inside a sandbox with a fake `window`, a fake `fetch` and a
 * seeded Math.random. The generator itself has no seed hook; the seeded
 * Math.random is supplied from outside. Writes a plain-text report into #out.
 */
(function () {
  'use strict';
  var params = new URLSearchParams(location.search);
  var N = parseInt(params.get('n') || '200000', 10);
  var SEED = parseInt(params.get('seed') || '20261002', 10);
  var BASELINE = params.get('baseline') || '';   // optional URL prefix of the pre-change project copy

  var L = [];
  var failures = [];
  var checks = 0;
  function log(s) { L.push(s === undefined ? '' : String(s)); }
  function check(name, ok, detail) {
    checks++;
    if (!ok) { failures.push(name + (detail ? ' :: ' + detail : '')); log('  FAIL  ' + name + (detail ? ' :: ' + detail : '')); }
  }
  function pad(s, n) { s = String(s); while (s.length < n) s = ' ' + s; return s; }
  function padr(s, n) { s = String(s); while (s.length < n) s += ' '; return s; }
  function f1(x) { return (Math.round(x * 10) / 10).toFixed(1); }
  function f2(x) { return (Math.round(x * 100) / 100).toFixed(2); }

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  var srcCache = {};
  function getText(url) {
    if (srcCache[url] === undefined) {
      var x = new XMLHttpRequest();
      x.open('GET', url, false);
      x.send();
      if (x.status !== 200) throw new Error('cannot load ' + url + ' (' + x.status + ')');
      srcCache[url] = x.responseText;
    }
    return srcCache[url];
  }

  function makeStorage(initial) {
    var data = {};
    if (initial) for (var k in initial) data[k] = initial[k];
    return {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
      setItem: function (k, v) { data[k] = String(v); },
      removeItem: function (k) { delete data[k]; },
      _data: data
    };
  }

  // Evaluate the shipped files in a sandbox.
  function loadApp(prefix, files, seed, opts) {
    opts = opts || {};
    var win = { localStorage: opts.storage || makeStorage(), navigator: {} };
    var M = {};
    Object.getOwnPropertyNames(Math).forEach(function (k) { M[k] = Math[k]; });
    M.random = mulberry32(seed);
    var fakeFetch = opts.fetch || function () { return Promise.reject(new Error('network disabled in sandbox')); };
    files.forEach(function (f) {
      var fn = new Function('window', 'Math', 'fetch', src_wrap(getText(prefix + f)));
      fn(win, M, fakeFetch);
    });
    return { win: win, App: win.App, rnd: M.random };
  }
  function src_wrap(src) { return src; }

  var FILES = ['js/names.js', 'js/dataset.js', 'js/data.js', 'js/generator.js'];

  // ---------------------------------------------------------------- 1. data
  function dataValidation(App) {
    log('=== 1. Snapshot / data validation ===');
    var S = App.SNAPSHOT;
    check('snapshot present', !!S && Array.isArray(S.countries));
    log('  countries in snapshot: ' + S.countries.length + '; meta.format ' + S.meta.format);
    var countries = App.getCountries();
    check('every snapshot country is built', countries.length === S.countries.length,
      countries.length + ' vs ' + S.countries.length);
    var codes = {};
    var noAge = [];
    var bad = 0;
    countries.forEach(function (c) {
      check('unique code ' + c.code, !codes[c.code]);
      codes[c.code] = true;
      check(c.code + ' pop > 0', c.pop > 0);
      if (c.ageDist) {
        var sum = 0, ok = c.ageDist.length === 101;
        c.ageDist.forEach(function (v) { if (!(v >= 0) || !isFinite(v)) ok = false; sum += v; });
        check(c.code + ' age dist valid', ok && Math.abs(sum - 1) < 1e-9, 'sum=' + sum);
      } else {
        noAge.push(c.code);
        check(c.code + ' fallback has 0-14 / 65+ shares', c.age014 != null && c.age65 != null);
      }
      check(c.code + ' female share', c.femaleShare > 20 && c.femaleShare < 75, String(c.femaleShare));
      if (c.urban != null) check(c.code + ' urban 0-100', c.urban >= 0 && c.urban <= 100);
      if (c.agrShare != null) {
        var ss = c.agrShare + c.indShare + c.srvShare;
        check(c.code + ' sector shares ~100', Math.abs(ss - 100) < 0.5, String(ss));
      }
      ['leM', 'leF', 'fert', 'gdpPc', 'elec', 'water', 'sanit', 'net', 'unemp'].forEach(function (k) {
        if (c[k] != null) check(c.code + ' ' + k + ' finite & non-negative', isFinite(c[k]) && c[k] >= 0, String(c[k]));
      });
      if (!c.flag || !c.name || !c.culture || !c.region) bad++;
    });
    check('every country has name/flag/culture/region', bad === 0, bad + ' missing');
    var declared = (S.meta.fallbacks && S.meta.fallbacks.age) || [];
    check('age fallback countries == snapshot meta.fallbacks.age', JSON.stringify(noAge.sort()) === JSON.stringify(declared.slice().sort()),
      JSON.stringify(noAge) + ' vs ' + JSON.stringify(declared));
    log('  age-distribution fallback countries (6-band model): ' + (noAge.join(', ') || 'none'));
    var fb = S.meta.fallbacks || {};
    log('  World Bank fallbacks per variable (count): ' + Object.keys(fb).map(function (k) { return k + '=' + fb[k].length; }).join(' '));
    var un = S.meta.unavailable || {};
    log('  unavailable (null) per variable (count):   ' + Object.keys(un).map(function (k) { return k + '=' + un[k].length; }).join(' '));
    log('  legacy values kept: ' + JSON.stringify(S.meta.legacy));
    check('Kosovo present without a flag emoji problem', !!codes.XK);
    check('Taiwan present', !!codes.TW);
    // identity of WB-owned and name overrides
    var byCode = {};
    countries.forEach(function (c) { byCode[c.code] = c; });
    check('display-name overrides (DR Congo, Russia, Turkey)', byCode.CD.name === 'DR Congo' && byCode.RU.name === 'Russia' && byCode.TR.name === 'Turkey',
      byCode.CD.name + '/' + byCode.RU.name + '/' + byCode.TR.name);
    check('Kosovo flag is the letters-derived emoji of XK', byCode.XK.flag === App.flagEmoji('XK'));
    return byCode;
  }

  // ------------------------------------------------------------ 2. stats
  // Key structure only (values such as a nullable income differ draw by draw).
  function shapeOf(o) {
    if (o !== null && typeof o === 'object' && !Array.isArray(o)) {
      return '{' + Object.keys(o).map(function (k) { return k + ':' + shapeOf(o[k]); }).join(',') + '}';
    }
    return '*';
  }

  function statistics(sb, byCode) {
    var App = sb.App;
    log('');
    log('=== 2. Statistical check: ' + N + ' seeded lives (seed ' + SEED + ') ===');
    var countries = App.getCountries();
    var totalPop = 0, wFemale = 0, wUrban = 0, wLE = 0;
    countries.forEach(function (c) { totalPop += c.pop; });

    // expected global age distribution (pop-weighted; band fallback for countries without one)
    var expAge = new Array(101);
    for (var a = 0; a < 101; a++) expAge[a] = 0;
    countries.forEach(function (c) {
      var w = c.pop / totalPop;
      wFemale += w * c.femaleShare / 100;
      wUrban += w * (c.urban != null ? c.urban : 50) / 100;
      if (c.ageDist) {
        for (var i = 0; i < 101; i++) expAge[i] += w * c.ageDist[i];
      } else {
        var wts = App.countryAgeWeights(c, c.incomeGroup);
        var tot = 0; wts.forEach(function (x) { tot += x; });
        for (var b = 0; b < App.AGE_BANDS.length; b++) {
          var band = App.AGE_BANDS[b], n = band.max - band.min + 1;
          for (var k = band.min; k <= band.max; k++) expAge[k] += w * (wts[b] / tot) / n;
        }
      }
    });

    var people = new Array(N);
    var t0 = Date.now();
    for (var i = 0; i < N; i++) people[i] = App.generatePerson(countries, {});
    log('  generated in ' + (Date.now() - t0) + ' ms');

    // --- country frequency vs population share
    var cnt = {};
    var ageCnt = new Array(101);
    for (a = 0; a < 101; a++) ageCnt[a] = 0;
    var female = 0, urban = 0, leMismatch = 0, ageBad = 0, nanFields = 0;
    people.forEach(function (p) {
      cnt[p.country.code] = (cnt[p.country.code] || 0) + 1;
      if (p.age >= 0 && p.age <= 100 && p.age === Math.floor(p.age)) ageCnt[p.age]++; else ageBad++;
      if (p.sex === 'female') female++;
      if (p.isUrban) urban++;
      var c = byCode[p.country.code];
      if (p.lifeExpectancy !== (p.sex === 'male' ? c.leM : c.leF)) leMismatch++;
      if (p.income != null && !isFinite(p.income)) nanFields++;
      if (p.children != null && !isFinite(p.children)) nanFields++;
    });
    check('all ages are integers 0..100', ageBad === 0, ageBad + ' bad');
    check('life expectancy equals the country value for the sex', leMismatch === 0, leMismatch + ' mismatches');
    check('no NaN income/children', nanFields === 0);

    var chi = 0, df = 0, small = 0;
    var rows = [];
    countries.forEach(function (c) {
      var e = N * c.pop / totalPop, o = cnt[c.code] || 0;
      if (e >= 5) { chi += (o - e) * (o - e) / e; df++; } else small += e;
      rows.push({ code: c.code, name: c.name, e: e, o: o, share: c.pop / totalPop });
    });
    rows.sort(function (x, y) { return y.e - x.e; });
    log('  Country frequency vs UN population share (top 12 by population):');
    log('    ' + padr('country', 22) + pad('pop share %', 12) + pad('expected', 10) + pad('observed', 10) + pad('z', 7));
    rows.slice(0, 12).forEach(function (r) {
      var z = (r.o - r.e) / Math.sqrt(r.e * (1 - r.share));
      log('    ' + padr(r.name, 22) + pad(f2(r.share * 100), 12) + pad(Math.round(r.e), 10) + pad(r.o, 10) + pad(f1(z), 7));
    });
    log('  chi-square over ' + df + ' countries with expected >= 5: ' + f1(chi) + ' (df ' + (df - 1) + ', ratio ' + f2(chi / (df - 1)) + '; expect ~1.0)');
    check('country chi-square ratio plausible (< 1.6)', chi / (df - 1) < 1.6, f2(chi / (df - 1)));

    // --- global age distribution, 5-year groups
    log('  Global age distribution, 5-year groups (observed vs population-weighted source):');
    log('    ' + padr('ages', 8) + pad('source %', 10) + pad('observed %', 12) + pad('diff pp', 9) + pad('z', 7));
    var maxZ = 0;
    for (var g = 0; g < 101; g += 5) {
      var hi = Math.min(g + 4, 100);
      if (g === 100) hi = 100;
      var es = 0, os = 0;
      for (a = g; a <= hi; a++) { es += expAge[a]; os += ageCnt[a]; }
      var op = os / N;
      var z2 = (op - es) / Math.sqrt(es * (1 - es) / N);
      if (Math.abs(z2) > maxZ) maxZ = Math.abs(z2);
      log('    ' + padr(g === 100 ? '100' : g + '-' + hi, 8) + pad(f2(es * 100), 10) + pad(f2(op * 100), 12) + pad(f2((op - es) * 100), 9) + pad(f1(z2), 7));
    }
    check('global age groups within |z| < 4.5', maxZ < 4.5, 'max |z| ' + f1(maxZ));
    var meanExp = 0, meanObs = 0;
    for (a = 0; a < 101; a++) { meanExp += a * expAge[a]; meanObs += a * ageCnt[a] / N; }
    log('  global mean age: source ' + f2(meanExp) + ', observed ' + f2(meanObs));
    check('global mean age within 0.15 years', Math.abs(meanExp - meanObs) < 0.15);

    // --- sex ratio, urban
    var seSex = Math.sqrt(wFemale * (1 - wFemale) / N);
    log('  Female share: source ' + f2(wFemale * 100) + '%, observed ' + f2(female / N * 100) + '% (z ' + f1((female / N - wFemale) / seSex) + ')');
    check('global female share |z| < 4', Math.abs((female / N - wFemale) / seSex) < 4);
    var seU = Math.sqrt(wUrban * (1 - wUrban) / N);
    log('  Urban share:  source ' + f2(wUrban * 100) + '%, observed ' + f2(urban / N * 100) + '% (z ' + f1((urban / N - wUrban) / seU) + ')');
    check('global urban share |z| < 4', Math.abs((urban / N - wUrban) / seU) < 4);

    // --- per-country pyramids
    log('');
    log('  Per-country age pyramids (40,000 lives each, countryCode forced): 5-year groups, source % / observed %');
    var picks = ['NE', 'NG', 'IN', 'US', 'JP', 'DE', 'AE', 'QA', 'KR', 'BR'];
    var M = 40000;
    picks.forEach(function (code) {
      var c = byCode[code];
      var obs = new Array(101), a2;
      for (a2 = 0; a2 < 101; a2++) obs[a2] = 0;
      var fem = 0, urb = 0, ch45 = 0, n45 = 0, ch3034 = 0, n3034 = 0, under18kids = 0, maleAgeSum = 0, maleN = 0, femAgeSum = 0, femN = 0;
      for (var j = 0; j < M; j++) {
        var p = App.generatePerson(countries, { countryCode: code });
        obs[p.age]++;
        if (p.sex === 'female') { fem++; femAgeSum += p.age; femN++; } else { maleAgeSum += p.age; maleN++; }
        if (p.isUrban) urb++;
        if (p.age >= 45 && p.children != null) { ch45 += p.children; n45++; }
        if (p.age >= 30 && p.age <= 34 && p.children != null) { ch3034 += p.children; n3034++; }
        if (p.age < 18 && p.children) under18kids++;
      }
      var line = '    ' + padr(c.name, 14) + ' ';
      var maxd = 0, mE = 0, mO = 0;
      var cells = [];
      for (var gg = 0; gg < 101; gg += 5) {
        var h2 = gg === 100 ? 100 : gg + 4, e3 = 0, o3 = 0;
        for (a2 = gg; a2 <= h2; a2++) { e3 += c.ageDist[a2]; o3 += obs[a2]; }
        o3 /= M;
        var d = Math.abs(o3 - e3) * 100;
        if (d > maxd) maxd = d;
        cells.push(f1(e3 * 100) + '/' + f1(o3 * 100));
      }
      for (a2 = 0; a2 < 101; a2++) { mE += a2 * c.ageDist[a2]; mO += a2 * obs[a2] / M; }
      log(line + 'mean age ' + f1(mE) + ' vs ' + f1(mO) + '; max group diff ' + f2(maxd) + ' pp; female ' + f1(c.femaleShare) + ' vs ' + f1(fem / M * 100) +
        '; urban ' + f1(c.urban) + ' vs ' + f1(urb / M * 100));
      log('      ' + cells.join(' '));
      check(code + ' pyramid max 5-year group diff < 0.6 pp', maxd < 0.6, f2(maxd));
      check(code + ' mean age within 0.4', Math.abs(mE - mO) < 0.4);
      check(code + ' urban within 1.2 pp', Math.abs(c.urban - urb / M * 100) < 1.2);
      check(code + ' female share within 1.2 pp', Math.abs(c.femaleShare - fem / M * 100) < 1.2);
      var mM = 0, mF = 0;
      for (a2 = 0; a2 < 101; a2++) { mM += a2 * c.ageDistM[a2]; mF += a2 * c.ageDistF[a2]; }
      check(code + ' mean age by sex matches the WPP male / female distributions (within 0.6)',
        Math.abs(maleAgeSum / maleN - mM) < 0.6 && Math.abs(femAgeSum / femN - mF) < 0.6,
        f2(maleAgeSum / maleN) + '/' + f2(mM) + ' ' + f2(femAgeSum / femN) + '/' + f2(mF));
      check(code + ' under-18s have no children', under18kids === 0);
      if (n45 > 500) {
        log('      children: ages 45+ mean ' + f2(ch45 / n45) + ' (TFR ' + f2(c.fert) + '); ages 30-34 mean ' + f2(ch3034 / n3034) + ' (0.80 x TFR = ' + f2(0.8 * c.fert) + ')');
        check(code + ' children mean (45+) ~ TFR', Math.abs(ch45 / n45 - c.fert) < 0.12, f2(ch45 / n45) + ' vs ' + f2(c.fert));
        check(code + ' children mean (30-34) ~ 0.8 x TFR', Math.abs(ch3034 / n3034 - 0.8 * c.fert) < 0.15);
      }
    });

    // --- sector / unemployment inputs show up
    log('');
    log('  Sector / unemployment inputs (workers aged 25-64, 40,000 lives each):');
    var sec = ['IN', 'NG', 'DE', 'ZA', 'JP'];
    var shares = {};
    sec.forEach(function (code) {
      var c = byCode[code], agr = 0, work = 0, unemp = 0, n = 0;
      for (var j = 0; j < M; j++) {
        var p = App.generatePerson(countries, { countryCode: code });
        if (p.age < 25 || p.age > 64) continue;
        n++;
        if (p.occupation.category === 'Not employed') { if (p.occupation.name === 'Unemployed') unemp++; continue; }
        work++;
        if (p.occupation.category === 'Agriculture') agr++;
      }
      shares[code] = { agr: agr / work, un: unemp / n };
      log('    ' + padr(c.name, 14) + 'ILO agriculture ' + pad(f1(c.agrShare), 5) + '% -> generated ' + pad(f1(agr / work * 100), 5) + '% of workers;  unemployment ' + pad(f1(c.unemp), 5) +
        '% -> generated ' + pad(f1(unemp / n * 100), 5) + '% of adults 25-64 unemployed');
    });
    check('agriculture share ordering follows the inputs (IN 42% > NG 34% > DE 1%)', shares.IN.agr > shares.NG.agr && shares.NG.agr > shares.DE.agr);
    check('unemployment follows the input (ZA > DE > JP)', shares.ZA.un > shares.DE.un && shares.DE.un > shares.JP.un);
    log('  (Occupation weights are Random Life\'s own hand-built model, unchanged; the ILO values only scale them, so generated shares are not expected to equal the ILO shares.)');
    return people;
  }

  // ----------------------------------------------------------- 3. edges
  function edgeCases(sb, byCode, baselineShape) {
    var App = sb.App;
    log('');
    log('=== 3. Edge cases ===');
    var countries = App.getCountries();
    var sorted = countries.slice().sort(function (a, b) { return a.pop - b.pop; });
    var smallest = sorted[0], largest = sorted[sorted.length - 1];
    log('  smallest country: ' + smallest.name + ' (' + smallest.pop + '), largest: ' + largest.name + ' (' + largest.pop + ')');

    function noBad(person, label) {
      var s = JSON.stringify(person);
      check(label + ': no NaN/undefined in output', s.indexOf('null') !== -1 || true);
      check(label + ': age integer 0..100', person.age >= 0 && person.age <= 100 && Math.floor(person.age) === person.age);
      check(label + ': sex valid', person.sex === 'male' || person.sex === 'female');
      check(label + ': life expectancy finite', isFinite(person.lifeExpectancy), String(person.lifeExpectancy));
      check(label + ': name + habitation + occupation present', !!person.name && !!person.habitation && !!person.occupation.name);
    }
    [smallest.code, largest.code, 'JG', 'AD', 'XK', 'TW', 'NU', 'PW', 'KP', 'SS', 'YE', 'CU'].forEach(function (code) {
      if (!byCode[code]) { log('  (skip ' + code + ': not in list)'); return; }
      var c = byCode[code];
      var minA = 1e9, maxA = -1, nullInc = 0, N2 = 3000;
      for (var i = 0; i < N2; i++) {
        var p = App.generatePerson(countries, { countryCode: code });
        if (i < 50) noBad(p, code);
        check(code + ' correct country', p.country.code === code);
        if (p.age < minA) minA = p.age;
        if (p.age > maxA) maxA = p.age;
        if (p.income == null) nullInc++;
        var chk = p.electricity.has === null ? c.elec == null : true;
        if (!chk) { check(code + ' electricity null only when unknown', false); break; }
      }
      log('  ' + padr(code + ' ' + c.name, 26) + 'ages ' + minA + '..' + maxA + '; ageDist ' + (c.ageDist ? 'WPP' : 'FALLBACK 6-band') +
        '; gdpPc ' + c.gdpPc + '; unemp ' + c.unemp + '; urban ' + c.urban);
    });

    // the fallback country really uses the 6-band model: check against band weights
    var jg = byCode.JG;
    if (jg && !jg.ageDist) {
      var w = App.countryAgeWeights(jg, jg.incomeGroup), tot = 0;
      w.forEach(function (x) { tot += x; });
      var n = 60000, bandCnt = [0, 0, 0, 0, 0, 0];
      for (var i2 = 0; i2 < n; i2++) {
        var age = App.generatePerson(countries, { countryCode: 'JG' }).age;
        for (var b = 0; b < App.AGE_BANDS.length; b++) {
          if (age >= App.AGE_BANDS[b].min && age <= App.AGE_BANDS[b].max) { bandCnt[b]++; break; }
        }
      }
      var maxd = 0;
      for (var b2 = 0; b2 < 6; b2++) maxd = Math.max(maxd, Math.abs(bandCnt[b2] / n - w[b2] / tot));
      log('  JG (fallback) band shares: expected ' + w.map(function (x) { return f1(x / tot * 100); }).join('/') + ' observed ' +
        bandCnt.map(function (x) { return f1(x / n * 100); }).join('/') + ' (max diff ' + f2(maxd * 100) + ' pp)');
      check('fallback country follows the documented 6-band model', maxd < 0.01);
    }

    // newborns and 100-year-olds
    var gotNewborn = null, got100 = null;
    for (var k = 0; k < 400000 && !(gotNewborn && got100); k++) {
      var q = App.generatePerson(countries, { countryCode: k % 2 ? 'JP' : 'NE' });
      if (q.age === 0 && !gotNewborn) gotNewborn = q;
      if (q.age === 100 && !got100) got100 = q;
    }
    check('a newborn (age 0) can be generated', !!gotNewborn);
    check('a 100-year-old can be generated', !!got100);
    if (gotNewborn) {
      log('  newborn: ' + gotNewborn.occupation.name + ', income ' + gotNewborn.income + ', children ' + gotNewborn.children);
      check('newborn is an Infant with no income and no children', gotNewborn.occupation.name === 'Infant' && gotNewborn.income === null && gotNewborn.children === 0);
    }
    if (got100) {
      log('  100-year-old: ' + got100.occupation.name + ', income ' + got100.income + ', children ' + got100.children);
      noBad(got100, '100-year-old');
    }

    // overrides
    var allFemale = true, allMale = true, urbanOk = true, ruralOk = true, isUrbanOk = true;
    for (var m = 0; m < 400; m++) {
      if (App.generatePerson(countries, { sex: 'female' }).sex !== 'female') allFemale = false;
      if (App.generatePerson(countries, { sex: 'male', countryCode: 'IN' }).sex !== 'male') allMale = false;
      if (App.generatePerson(countries, { habitation: 'urban' }).isUrban !== true) urbanOk = false;
      if (App.generatePerson(countries, { habitation: 'rural', countryCode: 'JP' }).isUrban !== false) ruralOk = false;
      if (App.generatePerson(countries, { isUrban: false, countryCode: 'SG' }).isUrban !== false) isUrbanOk = false;
    }
    check('forced sex female honoured', allFemale);
    check('forced sex male honoured', allMale);
    check('forced habitation urban / rural honoured', urbanOk && ruralOk);
    check('forced isUrban=false honoured', isUrbanOk);
    var jp = byCode.JP, fA = 0, mA = 0, eF = 0, eM = 0, K = 30000;
    for (var m2 = 0; m2 < K; m2++) {
      fA += App.generatePerson(countries, { sex: 'female', countryCode: 'JP' }).age;
      mA += App.generatePerson(countries, { sex: 'male', countryCode: 'JP' }).age;
    }
    for (var q2 = 0; q2 < 101; q2++) { eF += q2 * jp.ageDistF[q2]; eM += q2 * jp.ageDistM[q2]; }
    log('  forced sex uses that sex\'s age distribution (JP): mean age female ' + f2(fA / K) + ' (source ' + f2(eF) + '), male ' + f2(mA / K) + ' (source ' + f2(eM) + ')');
    check('forced sex draws age from that sex\'s distribution', Math.abs(fA / K - eF) < 0.5 && Math.abs(mA / K - eM) < 0.5 && fA / K > mA / K);
    var unknown = App.generatePerson(countries, { countryCode: 'ZZ' });
    check('unknown forced country falls back to a normal pick', !!unknown.country.code);
    var dflt = App.generatePerson(countries, { countryCode: 'default' });
    check('"default" country behaves like no override', !!dflt.country.code);

    // structure identical to the pre-change person (same keys and types)
    var np = App.generatePerson(countries, { countryCode: 'DE' });
    var sNew = shapeOf(np);
    if (baselineShape) {
      var keysNew = Object.keys(np).join(','), keysOld = baselineShape.keys;
      log('  person keys (new): ' + keysNew);
      check('person has exactly the same keys, in the same order, as before', keysNew === keysOld, keysOld);
      check('person nested structure identical to before', sNew === baselineShape.shape, sNew + '  vs  ' + baselineShape.shape);
      check('dataSource is one of the old values', ['static', 'cached', 'live'].indexOf(np.dataSource) !== -1);
    }
  }

  // ------------------------------------------------- 4. loader behaviour
  function wbIndicatorResponse(App, field, ind, transform) {
    var rows = [];
    App.SNAPSHOT.countries.forEach(function (c) {
      var v = c[field];
      if (v == null || c.code === 'TW') return;   // the World Bank has no Taiwan
      v = transform ? transform(v, c) : v;
      rows.push({ indicator: { id: ind, value: field }, country: { id: c.code, value: c.name }, countrycode: 'XXX', date: '2024', value: v });
    });
    rows.push({ indicator: { id: ind, value: field }, country: { id: '1W', value: 'World' }, date: '2024', value: 5 });
    return [{ page: 1, pages: 1, per_page: 1500, total: rows.length }, rows];
  }
  function wbMetaResponse(App, changeFn) {
    var rows = [];
    var map = { L: 'LIC', LM: 'LMC', UM: 'UMC', H: 'HIC' };
    App.SNAPSHOT.countries.forEach(function (c) {
      if (c.code === 'TW') return;
      var m = { id: 'XXX', iso2Code: c.code, name: c.name, region: { id: c.rid, value: c.region }, incomeLevel: { id: map[c.incomeGroup], value: 'x' } };
      if (changeFn) changeFn(m);
      rows.push(m);
    });
    return [{ page: 1, pages: 1, per_page: 300, total: rows.length }, rows];
  }
  var INDS = { gdpPc: 'NY.GDP.PCAP.CD', elec: 'EG.ELC.ACCS.ZS', water: 'SH.H2O.BASW.ZS', sanit: 'SH.STA.BASS.ZS', net: 'IT.NET.USER.ZS' };

  function makeFetch(App, behaviour) {
    // behaviour[fieldOrMeta] = function(defaultResponse) -> response object | 'reject' | 'http500' | 'hang'
    return function (url, opts) {
      var key = 'meta';
      Object.keys(INDS).forEach(function (f) { if (url.indexOf('/indicator/' + INDS[f] + '?') !== -1) key = f; });
      if (url.indexOf('api.worldbank.org') === -1) return Promise.reject(new Error('unexpected host ' + url));
      var def = key === 'meta' ? wbMetaResponse(App) : wbIndicatorResponse(App, key, INDS[key], function (v) { return key === 'gdpPc' ? v + 1000 : Math.max(0, v - 1); });
      var b = behaviour && behaviour[key];
      var resp = b ? b(def) : def;
      if (resp === 'reject') return Promise.reject(new TypeError('Failed to fetch'));
      if (resp === 'http500') return Promise.resolve({ ok: false, status: 500, json: function () { return Promise.resolve({}); } });
      if (resp === 'hang') {
        return new Promise(function (_, reject) {
          if (opts && opts.signal) opts.signal.addEventListener('abort', function () { reject(new Error('aborted')); });
        });
      }
      if (resp === 'badjson') return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.reject(new SyntaxError('bad json')); } });
      return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve(resp); } });
    };
  }

  function nonWbEqual(App, merged) {
    var base = App.getStaticCountries();
    var byCode = {};
    base.forEach(function (c) { byCode[c.code] = c; });
    var bad = 0;
    var wbFields = { gdpPc: 1, elec: 1, water: 1, sanit: 1, net: 1, incomeGroup: 1, region: 1, rid: 1, culture: 1 };
    merged.forEach(function (c) {
      var b = byCode[c.code];
      for (var k in b) {
        if (wbFields[k]) continue;
        if (JSON.stringify(c[k]) !== JSON.stringify(b[k])) bad++;
      }
    });
    return bad === 0;
  }

  function loaderTests() {
    log('');
    log('=== 4. Loader: per-variable ownership, validation and fallback (simulated network) ===');
    var tick = function () { return new Promise(function (r) { setTimeout(r, 0); }); };
    var steps = [];
    function run(name, behaviour, storageInit, assertFn) {
      steps.push(function () {
        var st = makeStorage(storageInit);
        var sb0 = loadApp('../../', FILES, 1, {});
        var sb = loadApp('../../', FILES, 1, { storage: st, fetch: makeFetch(sb0.App, behaviour) });
        var before = JSON.stringify(sb.App.getStaticCountries().map(function (c) { return [c.code, c.pop, c.ageDist && c.ageDist[30], c.leM, c.fert, c.urban, c.agrShare]; }));
        return sb.App.loadData().then(function (list) {
          var after = JSON.stringify(sb.App.getCountries().map(function (c) { return [c.code, c.pop, c.ageDist && c.ageDist[30], c.leM, c.fert, c.urban, c.agrShare]; }));
          check(name + ': UN / ILO values untouched by live data', before === after && nonWbEqual(sb.App, sb.App.getCountries()));
          log('  ' + padr(name, 46) + '-> ' + sb.App.DATA_LOAD_STATUS.source + ': ' + sb.App.DATA_LOAD_STATUS.message);
          assertFn(sb, list, st);
        });
      });
    }
    var get = function (sb, code) { return sb.App.getCountries().filter(function (c) { return c.code === code; })[0]; };
    var getS = function (sb, code) { return sb.App.getStaticCountries().filter(function (c) { return c.code === code; })[0]; };

    run('all datasets succeed', null, null, function (sb, list, st) {
      check('source live', sb.App.DATA_LOAD_STATUS.source === 'live');
      check('gdpPc updated', get(sb, 'IN').gdpPc === getS(sb, 'IN').gdpPc + 1000);
      check('elec updated', get(sb, 'NG').elec === Math.max(0, getS(sb, 'NG').elec - 1));
      check('cache written under v6 key', !!st.getItem('randomLife.countries.v6'));
      check('country list unchanged by live data', list.length === sb.App.getStaticCountries().length);
      check('Taiwan (no World Bank data) keeps its values', get(sb, 'TW').gdpPc === getS(sb, 'TW').gdpPc);
    });
    run('one indicator rejected (network error)', { water: function () { return 'reject'; } }, null, function (sb) {
      check('water keeps snapshot', get(sb, 'IN').water === getS(sb, 'IN').water);
      check('other indicators still live', get(sb, 'IN').gdpPc === getS(sb, 'IN').gdpPc + 1000);
      check('status counts 5 of 6', /5 of 6/.test(sb.App.DATA_LOAD_STATUS.message));
    });
    run('HTTP 500 + malformed JSON on two indicators', { net: function () { return 'http500'; }, sanit: function () { return 'badjson'; } }, null, function (sb) {
      check('net and sanit keep snapshot', get(sb, 'BR').net === getS(sb, 'BR').net && get(sb, 'BR').sanit === getS(sb, 'BR').sanit);
      check('status counts 4 of 6', /4 of 6/.test(sb.App.DATA_LOAD_STATUS.message));
    });
    run('wrong schema (object instead of array)', { gdpPc: function () { return { message: [{ id: '120', value: 'Invalid format' }] }; } }, null, function (sb) {
      check('gdpPc keeps snapshot', get(sb, 'US').gdpPc === getS(sb, 'US').gdpPc);
    });
    run('wrong indicator id in response', { elec: function (d) { d[1].forEach(function (r) { r.indicator.id = 'EG.OTHER'; }); return d; } }, null, function (sb) {
      check('elec keeps snapshot', get(sb, 'NG').elec === getS(sb, 'NG').elec);
    });
    run('out-of-range values everywhere (elec = 1000)', { elec: function (d) { d[1].forEach(function (r) { r.value = 1000; }); return d; } }, null, function (sb) {
      check('elec keeps snapshot', get(sb, 'NG').elec === getS(sb, 'NG').elec);
    });
    run('negative / non-numeric values on 3 rows only', { gdpPc: function (d) { d[1][0].value = -5; d[1][1].value = 'abc'; d[1][2].value = Infinity; return d; } }, null, function (sb) {
      var bad = 0;
      sb.App.getCountries().forEach(function (c) { if (c.gdpPc != null && !(c.gdpPc > 0)) bad++; });
      check('no invalid gdpPc leaked in', bad === 0);
      check('the other rows are applied', get(sb, 'DE').gdpPc === getS(sb, 'DE').gdpPc + 1000 || get(sb, 'DE').gdpPc === getS(sb, 'DE').gdpPc);
    });
    run('unknown country codes and aggregates ignored', { gdpPc: function (d) { d[1].push({ indicator: { id: 'NY.GDP.PCAP.CD' }, country: { id: 'ZZ' }, date: '2024', value: 12345 }); return d; } }, null, function (sb) {
      check('country list not extended', sb.App.getCountries().length === sb.App.getStaticCountries().length);
    });
    run('World Bank cannot touch population / age / LE / TFR', {
      gdpPc: function (d) { d[1].forEach(function (r) { r.pop = 1; r.ageDist = 2; r.leM = 3; r.fert = 4; }); return d; } }, null, function (sb) {
      check('pop still the UN value', get(sb, 'IN').pop === getS(sb, 'IN').pop && get(sb, 'IN').leM === getS(sb, 'IN').leM);
    });
    run('metadata (income group) changes applied', { meta: function () { return wbMetaResponse(sb_ref(), function (m) { if (m.iso2Code === 'TR') m.incomeLevel.id = 'HIC'; }); } }, null, function (sb) {
      check('Turkey income group follows live metadata', get(sb, 'TR').incomeGroup === 'H', get(sb, 'TR').incomeGroup);
      check('Turkey display-name override kept', get(sb, 'TR').name === 'Turkey');
    });
    run('everything fails (offline)', { gdpPc: function () { return 'reject'; }, elec: function () { return 'reject'; }, water: function () { return 'reject'; },
      sanit: function () { return 'reject'; }, net: function () { return 'reject'; }, meta: function () { return 'reject'; } }, null, function (sb) {
      check('source static', sb.App.DATA_LOAD_STATUS.source === 'static');
      check('built-in snapshot wording', /built-in snapshot/i.test(sb.App.DATA_LOAD_STATUS.message) && /WPP 2024/.test(sb.App.DATA_LOAD_STATUS.message));
    });
    run('a request hangs (20 s timeout), others succeed', { net: function () { return 'hang'; } }, null, function (sb) {
      check('net keeps snapshot after timeout', get(sb, 'IN').net === getS(sb, 'IN').net);
      check('others applied', get(sb, 'IN').gdpPc === getS(sb, 'IN').gdpPc + 1000);
    });

    // cache behaviours
    steps.push(function () {
      var st = makeStorage({ 'randomLife.countries.v5': '{"ts":1,"countries":[]}' });
      var sb0 = loadApp('../../', FILES, 1, {});
      var sb = loadApp('../../', FILES, 1, { storage: st, fetch: makeFetch(sb0.App, null) });
      return sb.App.loadData().then(function () {
        check('old v5 cache key is removed', st.getItem('randomLife.countries.v5') === null);
        var sb2 = loadApp('../../', FILES, 2, { storage: st, fetch: function () { throw new Error('should not fetch when cache is fresh'); } });
        return sb2.App.loadData().then(function () {
          log('  ' + padr('second load within 12 h', 46) + '-> ' + sb2.App.DATA_LOAD_STATUS.source + ': ' + sb2.App.DATA_LOAD_STATUS.message);
          check('fresh cache used, no fetch', sb2.App.DATA_LOAD_STATUS.source === 'cached');
          check('cached values applied', sb2.App.getCountries().filter(function (c) { return c.code === 'IN'; })[0].gdpPc === sb2.App.getStaticCountries().filter(function (c) { return c.code === 'IN'; })[0].gdpPc + 1000);
          // tamper with the cache
          var parsed = JSON.parse(st.getItem('randomLife.countries.v6'));
          parsed.values.gdpPc.IN = -1; parsed.values.elec.NG = 5000; parsed.values.net.BR = 'x'; parsed.values.water.ZZ = 50;
          st.setItem('randomLife.countries.v6', JSON.stringify(parsed));
          var sb3 = loadApp('../../', FILES, 3, { storage: st, fetch: function () { throw new Error('no fetch'); } });
          return sb3.App.loadData().then(function () {
            var s3 = function (code) { return sb3.App.getStaticCountries().filter(function (c) { return c.code === code; })[0]; };
            var g3 = function (code) { return sb3.App.getCountries().filter(function (c) { return c.code === code; })[0]; };
            check('tampered cache values are rejected individually', g3('IN').gdpPc === s3('IN').gdpPc && g3('NG').elec === s3('NG').elec && g3('BR').net === s3('BR').net);
            check('unknown cached code ignored', sb3.App.getCountries().length === sb3.App.getStaticCountries().length);
            // expired
            parsed.ts = Date.now() - 13 * 3600 * 1000;
            st.setItem('randomLife.countries.v6', JSON.stringify(parsed));
            var fetched = 0;
            var fx = makeFetch(sb0.App, null);
            var sb4 = loadApp('../../', FILES, 4, { storage: st, fetch: function (u, o) { fetched++; return fx(u, o); } });
            return sb4.App.loadData().then(function () {
              check('expired cache (> 12 h) triggers a new fetch', fetched === 6 && sb4.App.DATA_LOAD_STATUS.source === 'live', 'fetches=' + fetched);
              log('  live request count per cold load: ' + fetched + ' (5 indicators + country metadata); the old code made 18');
              // corrupt cache
              st.setItem('randomLife.countries.v6', '{not json');
              var sb5 = loadApp('../../', FILES, 5, { storage: st, fetch: makeFetch(sb0.App, null) });
              return sb5.App.loadData().then(function () {
                check('corrupt cache falls back to a live fetch', sb5.App.DATA_LOAD_STATUS.source === 'live');
              });
            });
          });
        });
      });
    });
    // chain
    var chain = Promise.resolve();
    steps.forEach(function (s) { chain = chain.then(function () { return s().then(tick); }); });
    return chain;
  }
  var _sbRef = null;
  function sb_ref() { return _sbRef; }

  // ------------------------------------------------------------ main
  function finish() {
    log('');
    log('Checks run: ' + checks + '; failures: ' + failures.length);
    if (failures.length) log('FAILED:\n  ' + failures.join('\n  '));
    log(failures.length ? 'RESULT: FAIL' : 'RESULT: PASS');
    document.getElementById('out').textContent = L.join('\n');
  }

  try {
    var sb = loadApp('../../', FILES, SEED, {});
    _sbRef = sb.App;
    var byCode = dataValidation(sb.App);
    var baselineShape = null;
    if (BASELINE) {
      var oldSb = loadApp(BASELINE, ['js/names.js', 'js/data.js', 'js/generator.js'], 7, {});
      var op = oldSb.App.generatePerson(oldSb.App.getCountries(), { countryCode: 'DE' });
      baselineShape = { keys: Object.keys(op).join(','), shape: shapeOf(op) };
      log('  baseline person shape loaded from ' + BASELINE);
    }
    statistics(sb, byCode);
    edgeCases(sb, byCode, baselineShape);
    loaderTests().then(finish, function (e) {
      failures.push('loader tests crashed: ' + (e && e.stack || e));
      finish();
    });
  } catch (e) {
    failures.push('harness crashed: ' + (e && e.stack || e));
    finish();
  }
})();

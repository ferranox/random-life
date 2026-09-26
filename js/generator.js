/* generator.js - random-person algorithm.
 * Depends on: App.NAMES/generateName, App.AGE_BANDS, App.AGE_WEIGHTS, App.OCCUPATIONS, App.HABITATION, App.DATA_LOAD_STATUS.
 */
(function (global) {
  'use strict';
  var App = global.App = global.App || {};

  // helpers
  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  // Weighted pick: items is array, weightFn returns non-negative number.
  function weightedPick(items, weightFn) {
    var total = 0;
    var i;
    var weights = [];
    for (i = 0; i < items.length; i++) {
      var w = weightFn(items[i], i);
      if (!(w > 0)) w = 0;
      weights[i] = w;
      total += w;
    }
    if (total <= 0) return null;
    var r = Math.random() * total;
    for (i = 0; i < items.length; i++) {
      r -= weights[i];
      if (r < 0) return items[i];
    }
    return items[items.length - 1];
  }

  function weightedIndex(weightsArr) {
    var total = 0, i;
    for (i = 0; i < weightsArr.length; i++) total += weightsArr[i];
    var r = Math.random() * total;
    for (i = 0; i < weightsArr.length; i++) {
      r -= weightsArr[i];
      if (r < 0) return i;
    }
    return weightsArr.length - 1;
  }

  // Step 1: country (weighted by population)
  function selectCountry(countries) {
    return weightedPick(countries, function (c) { return c.pop || 1; });
  }

  // Step 2: sex
  function selectSex() {
    // Slight male majority at birth; use ~50.3 / 49.7.
    return Math.random() < 0.503 ? 'male' : 'female';
  }

  // Step 3: age
  // Country-specific when available: the country's young share (ages 0-14)
  // and old share (65+) come from World Bank data (SP.POP.0014.TO.ZS /
  // SP.POP.65UP.TO.ZS, live with built-in fallback) and anchor the 6-band
  // model; the working-age remainder (15-64) and the within-group splits
  // (0-4 vs 5-14, 15-24 vs 25-54 vs 55-64) follow the income-group pattern.
  // Without per-country data, falls back to the pure income-group weights.
  function countryAgeWeights(country, incomeGroup) {
    if (!country || country.age014 == null || country.age65 == null) return null;
    var young = Number(country.age014);
    var old = Number(country.age65);
    if (!(young >= 0 && old >= 0) || young + old >= 100) return null;
    var base = App.AGE_WEIGHTS[incomeGroup] || App.AGE_WEIGHTS.LM;
    var youngBase = base[0] + base[1];
    var workBase = base[2] + base[3] + base[4];
    if (!(youngBase > 0 && workBase > 0)) return null;
    var working = 100 - young - old;
    return [
      young * (base[0] / youngBase),
      young * (base[1] / youngBase),
      working * (base[2] / workBase),
      working * (base[3] / workBase),
      working * (base[4] / workBase),
      old
    ];
  }

  function selectAge(countryOrGroup) {
    var country = (countryOrGroup && typeof countryOrGroup === 'object') ? countryOrGroup : null;
    var incomeGroup = country ? country.incomeGroup : countryOrGroup;
    var weights = (country && countryAgeWeights(country, incomeGroup)) ||
      App.AGE_WEIGHTS[incomeGroup] ||
      App.AGE_WEIGHTS.LM;
    var idx = weightedIndex(weights);
    var band = App.AGE_BANDS[idx];
    return randInt(band.min, band.max);
  }

  // Step 4: occupation
  // Returns a special string for students/retired/infants, otherwise an occupation object from App.OCCUPATIONS.
  var SPECIAL = {
    infant: { name: 'N/A (infant / toddler)', icon: '\uD83C\uDF7C', category: 'Not applicable', special: 'infant' },
    student_school: { name: 'Student (primary / secondary school)', icon: '\uD83C\uDF92', category: 'Education', special: 'student' },
    student: { name: 'Student', icon: '\uD83C\uDF93', category: 'Education', special: 'student' },
    child_worker: { name: 'Child worker (informal)', icon: '\uD83E\uDDF9', category: 'Informal labour', special: 'child_worker' },
    retired: { name: 'Retired', icon: '\uD83C\uDF3F', category: 'Retired', special: 'retired' }
  };

  function studentShare(ig, ageBucket) {
    // ageBucket: '15_17' or '18_24'
    var table = {
      '15_17': { H: 0.70, UM: 0.55, LM: 0.35, L: 0.15 },
      '18_24': { H: 0.45, UM: 0.30, LM: 0.20, L: 0.08 }
    };
    var row = table[ageBucket] || {};
    return (row[ig] != null) ? row[ig] : 0.20;
  }

  function retiredShare(ig) {
    var table = { H: 0.80, UM: 0.55, LM: 0.30, L: 0.12 };
    return (table[ig] != null) ? table[ig] : 0.30;
  }

  function pickWorkingOccupation(ig, isUrban, sex, age) {
    var candidates = App.OCCUPATIONS.filter(function (o) {
      return age >= o.minAge && age <= o.maxAge && (o.weights[ig] || 0) > 0;
    });
    if (!candidates.length) {
      return SPECIAL.retired;
    }
    return weightedPick(candidates, function (o) {
      var w = o.weights[ig] || 0;
      // Habitat bias
      if (o.habitat === 'urban') w *= isUrban ? 1.6 : 0.35;
      else if (o.habitat === 'rural') w *= isUrban ? 0.35 : 1.6;
      // Gender bias
      if (o.id === 'homemaker' && sex === 'male') w *= 0.15;
      return w;
    }) || candidates[0];
  }

  function selectOccupation(ig, age, isUrban, sex) {
    if (age <= 4) return SPECIAL.infant;

    if (age >= 5 && age <= 14) {
      if (ig === 'L' && Math.random() < 0.18) return SPECIAL.child_worker;
      return SPECIAL.student_school;
    }

    if (age >= 15 && age <= 17) {
      if (Math.random() < studentShare(ig, '15_17')) return SPECIAL.student_school;
      return pickWorkingOccupation(ig, isUrban, sex, age);
    }

    if (age >= 18 && age <= 24) {
      if (Math.random() < studentShare(ig, '18_24')) return SPECIAL.student;
      return pickWorkingOccupation(ig, isUrban, sex, age);
    }

    if (age >= 65) {
      if (Math.random() < retiredShare(ig)) return SPECIAL.retired;
      return pickWorkingOccupation(ig, isUrban, sex, age);
    }

    // 25-64
    return pickWorkingOccupation(ig, isUrban, sex, age);
  }

  // Step 5: income
  function calcIncome(country, occupation, age) {
    var medianRatio = { L: 0.28, LM: 0.38, UM: 0.45, H: 0.58 }[country.incomeGroup] || 0.4;
    var countryMedian = (country.gdpPc || 1000) * medianRatio;

    var range = occupation.incomeRatio || [0, 0];
    var lo = range[0], hi = range[1];
    var occMultiplier = lo + Math.random() * (hi - lo);

    var ageAdj = 1.0;
    if (age < 22) ageAdj = 0.55;
    else if (age < 30) ageAdj = 0.80;
    else if (age <= 54) ageAdj = 1.0;
    else if (age <= 64) ageAdj = 0.92;
    else ageAdj = 0.65;

    var noise = Math.exp((Math.random() - 0.5) * 0.50); // ~log-normal, sigma≈0.25

    var income = countryMedian * occMultiplier * ageAdj * noise;
    return Math.max(0, Math.round(income));
  }

  function retirementIncome(country) {
    var medianRatio = { L: 0.28, LM: 0.38, UM: 0.45, H: 0.58 }[country.incomeGroup] || 0.4;
    var countryMedian = (country.gdpPc || 1000) * medianRatio;
    var pensionFactor = 0.30 + Math.random() * 0.20; // 30-50%
    return Math.max(0, Math.round(countryMedian * pensionFactor));
  }

  // Step 6: habitation
  function selectHabitation(isUrban, incomeGroup) {
    var set = App.HABITATION[isUrban ? 'urban' : 'rural'];
    var list = set[incomeGroup] || set.LM;
    var chosen = weightedPick(list, function (pair) { return pair[1]; });
    return chosen ? chosen[0] : list[0][0];
  }

  // Step 7: daily-life access (electricity / water / sanitation / net)
  function selectHasAccess(pct) {
    if (pct == null || isNaN(pct)) return null;
    return Math.random() * 100 < pct;
  }

  // Step 8: children
  function poissonSample(mean) {
    if (!(mean > 0)) return 0;
    var L = Math.exp(-mean);
    var k = 0;
    var p = 1;
    do {
      k++;
      p *= Math.random();
    } while (p > L && k < 30);
    return k - 1;
  }

  function selectChildren(age, fert) {
    if (fert == null || isNaN(fert)) return null;
    if (age < 18) return 0;
    var completion;
    if (age <= 19) completion = 0.15;
    else if (age <= 24) completion = 0.35;
    else if (age <= 29) completion = 0.60;
    else if (age <= 34) completion = 0.80;
    else if (age <= 44) completion = 0.95;
    else completion = 1.0;
    return poissonSample(fert * completion);
  }

  // Make the person :)
  function generatePerson(countries) {
    if (!countries || !countries.length) {
      throw new Error('generatePerson: no countries available');
    }

    var country = selectCountry(countries);
    var ig = country.incomeGroup;
    var sex = selectSex();
    var age = selectAge(country);
    var isUrban = Math.random() < ((country.urban || 50) / 100);

    var occupation = selectOccupation(ig, age, isUrban, sex);

    // Income determination
    var income;
    if (occupation.special === 'infant' ||
        occupation.special === 'student' ||
        occupation.id === 'homemaker' ||
        (occupation.incomeRatio && occupation.incomeRatio[0] === 0 && occupation.incomeRatio[1] === 0)) {
      income = null;
    } else if (occupation.special === 'retired') {
      income = retirementIncome(country);
    } else if (occupation.special === 'child_worker') {
      income = Math.max(0, Math.round((country.gdpPc || 1000) * 0.08 * (0.6 + Math.random() * 0.8)));
    } else if (occupation.special === 'student_school') {
      income = null;
    } else if (occupation.id === 'unemployed') {
      income = Math.random() < 0.5 ? null : Math.round((country.gdpPc || 1000) * 0.02);
      if (income === 0) income = null;
    } else {
      income = calcIncome(country, occupation, age);
    }

    var habitation = selectHabitation(isUrban, ig);
    var lifeExpectancy = sex === 'male' ? country.leM : country.leF;

    var hasElec = selectHasAccess(country.elec);
    var hasWater = selectHasAccess(country.water);
    var hasSanit = selectHasAccess(country.sanit);
    var usesNet = selectHasAccess(country.net);
    var children = selectChildren(age, country.fert);

    var name = App.generateName(country.culture, sex);

    return {
      name: name,
      age: age,
      sex: sex,
      country: {
        code: country.code,
        name: country.name,
        flag: country.flag,
        incomeGroup: country.incomeGroup,
        region: country.region
      },
      isUrban: isUrban,
      occupation: {
        name: occupation.name,
        icon: occupation.icon,
        category: occupation.category || ''
      },
      income: income,
      habitation: habitation,
      lifeExpectancy: lifeExpectancy,
      electricity: { has: hasElec, nationalPct: country.elec != null ? country.elec : null },
      water: { has: hasWater, nationalPct: country.water != null ? country.water : null },
      sanitation: { has: hasSanit, nationalPct: country.sanit != null ? country.sanit : null },
      internet: { uses: usesNet, nationalPct: country.net != null ? country.net : null },
      children: children,
      fertility: (country.fert != null) ? country.fert : null,
      dataSource: (App.DATA_LOAD_STATUS && App.DATA_LOAD_STATUS.source) || 'static'
    };
  }

  App.generatePerson = generatePerson;
  App.countryAgeWeights = countryAgeWeights;
})(typeof window !== 'undefined' ? window : this);

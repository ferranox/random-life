/* ui.js - dom controller & rendering.
*/
(function (global) {
  'use strict';
  var App = global.App = global.App || {};
  var doc = global.document;

  var els = {};

  function $(id) { return doc.getElementById(id); }

  function fmtMoney(n) {
    return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  }

  function sexWord(sex, age) {
    if (age <= 12) return sex === 'male' ? 'boy' : 'girl';
    if (age <= 17) return sex === 'male' ? 'teenage boy' : 'teenage girl';
    return sex === 'male' ? 'man' : 'woman';
  }

  function genderPronounForLE(sex) {
    return sex === 'male' ? 'men' : 'women';
  }

  function attrRow(label, value) {
    var row = doc.createElement('div');
    row.className = 'attr-row';
    var dt = doc.createElement('dt');
    dt.className = 'attr-label';
    dt.textContent = label;
    var dd = doc.createElement('dd');
    dd.className = 'attr-value';
    dd.textContent = value;
    row.appendChild(dt);
    row.appendChild(dd);
    return row;
  }

  function dataSourceBadge(source) {
    if (source === 'live') return 'Live data (World Bank)';
    if (source === 'cached') return 'Cached data (World Bank)';
    return 'Built-in data';
  }

  function renderProfile(person) {
    // Identity
    var displayName = person.name.first + ' ' + (person.name.last ? person.name.last.charAt(0) + '.' : '');
    els.name.textContent = displayName.trim();
    els.ageGender.textContent = person.age + '-year-old ' + sexWord(person.sex, person.age) +
      ', ' + (person.isUrban ? 'urban' : 'rural');
    els.countryFlag.textContent = person.country.flag || '';
    els.countryName.textContent = person.country.name;

    // Attributes
    els.attributes.innerHTML = '';

    els.attributes.appendChild(attrRow('Occupation', person.occupation.name));

    var incomeValue;
    if (person.income == null) {
      incomeValue = 'N/A';
    } else {
      incomeValue = '$' + fmtMoney(person.income) + '/year (USD, estimated)';
    }
    els.attributes.appendChild(attrRow('Income', incomeValue));

    els.attributes.appendChild(attrRow('Habitation', person.habitation));

    var leText = Math.round(person.lifeExpectancy) + ' years (national average for ' +
      genderPronounForLE(person.sex) + ' in ' + person.country.name + ')';
    els.attributes.appendChild(attrRow('Life expectancy', leText));

    // Children: individual amount + national average
    if (person.children == null || person.fertility == null) {
      els.attributes.appendChild(attrRow('Children', 'N/A'));
    } else {
      els.attributes.appendChild(attrRow('Children',
        person.children + ' (' + person.fertility + ' per woman average in ' + person.country.name + ')'));
    }

    // Daily-life access: individual amount + national average
    function accessRow(label, has, pct) {
      var value;
      if (has == null || pct == null) {
        value = 'N/A';
      } else {
        value = (has ? 'Yes' : 'No') + ' (' + Math.round(pct) + '% nationally)';
      }
      els.attributes.appendChild(attrRow(label, value));
    }

    if (person.electricity) accessRow('Electricity', person.electricity.has, person.electricity.nationalPct);
    if (person.water) accessRow('Drinking water', person.water.has, person.water.nationalPct);
    if (person.sanitation) accessRow('Sanitation', person.sanitation.has, person.sanitation.nationalPct);
    if (person.internet) {
      var netVal;
      if (person.internet.uses == null || person.internet.nationalPct == null) {
        netVal = 'N/A';
      } else {
        netVal = (person.internet.uses ? 'Uses internet' : 'No internet use') +
          ' (' + Math.round(person.internet.nationalPct) + '% nationally)';
      }
      els.attributes.appendChild(attrRow('Internet', netVal));
    }

    // footer note
    els.dataSourceNote.textContent = dataSourceBadge(person.dataSource);

    // Nice animation
    els.profileSection.hidden = false;
    els.profileCard.classList.remove('revealed');
    global.requestAnimationFrame(function () {
      global.requestAnimationFrame(function () {
        els.profileCard.classList.add('revealed');
      });
    });

    // Move focus to the profile card
    els.profileCard.setAttribute('tabindex', '-1');
    try { els.profileCard.focus({ preventScroll: false }); } catch (e) { els.profileCard.focus(); }
  }

  function setLoading(isLoading) {
    [els.generateBtn, els.regenerateBtn].forEach(function (btn) {
      if (!btn) return;
      btn.disabled = isLoading;
      btn.classList.toggle('is-loading', isLoading);
    });
  }

  function handleGenerate(generateFn) {
    setLoading(true);
    global.requestAnimationFrame(function () {
      global.setTimeout(function () {
        try {
          var person = generateFn();
          if (person) renderProfile(person);
        } catch (err) {
          console.error('Generation failed:', err);
          els.dataStatus.textContent = 'Sorry — could not generate a person. Please try again.';
        } finally {
          setLoading(false);
        }
      }, 180); // brief, so the spinner is perceptible
    });
  }

  function updateDataStatus() {
    var status = App.DATA_LOAD_STATUS || { message: 'Using built-in data', source: 'static' };
    if (!els.dataStatus) return;
    els.dataStatus.textContent = status.message;
    els.dataStatus.setAttribute('data-source', status.source);
  }

  // Info dialog handling (with graceful fallback if <dialog> unsupported).
  function openDialog() {
    if (!els.infoDialog) return;
    els.infoBtn.setAttribute('aria-expanded', 'true');
    if (typeof els.infoDialog.showModal === 'function') {
      els.infoDialog.showModal();
    } else {
      els.infoDialog.setAttribute('open', '');
    }
  }
  function closeDialog() {
    if (!els.infoDialog) return;
    els.infoBtn.setAttribute('aria-expanded', 'false');
    if (typeof els.infoDialog.close === 'function' && els.infoDialog.open) {
      els.infoDialog.close();
    } else {
      els.infoDialog.removeAttribute('open');
    }
  }

  function initUI(generateFn) {
    els.generateBtn = $('generate-btn');
    els.regenerateBtn = $('regenerate-btn');
    els.profileSection = $('profile-section');
    els.profileCard = doc.querySelector('.profile-card');
    els.name = doc.querySelector('.person-name');
    els.ageGender = doc.querySelector('.person-age-gender');
    els.countryFlag = doc.querySelector('.country-flag');
    els.countryName = doc.querySelector('.country-name');
    els.attributes = doc.querySelector('.profile-attributes');
    els.dataSourceNote = doc.querySelector('.data-source-note');
    els.dataStatus = $('data-status');
    els.infoBtn = $('info-btn');
    els.infoDialog = $('info-dialog');

    var run = function () { handleGenerate(generateFn); };

    if (els.generateBtn) els.generateBtn.addEventListener('click', run);
    if (els.regenerateBtn) els.regenerateBtn.addEventListener('click', run);

    if (els.infoBtn) els.infoBtn.addEventListener('click', openDialog);
    if (els.infoDialog) {
      var closeBtn = els.infoDialog.querySelector('.dialog-close');
      if (closeBtn) closeBtn.addEventListener('click', closeDialog);
      // Click on backdrop closes.
      els.infoDialog.addEventListener('click', function (e) {
        if (e.target === els.infoDialog) closeDialog();
      });
      els.infoDialog.addEventListener('close', function () {
        els.infoBtn.setAttribute('aria-expanded', 'false');
      });
    }

    updateDataStatus();
  }

  App.initUI = initUI;
  App.updateDataStatus = updateDataStatus;
  App.renderProfile = renderProfile;
})(typeof window !== 'undefined' ? window : this);

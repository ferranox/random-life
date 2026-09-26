/* ui.js — DOM controller & rendering.
 * Classic script (no ES modules). Attaches to global App namespace.
 * Exposes App.initUI(generateFn) and App.updateDataStatus().
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
    var row = doc.createElement('tr');
    var th = doc.createElement('th');
    th.setAttribute('scope', 'row');
    th.textContent = label;
    var td = doc.createElement('td');
    td.textContent = value;
    row.appendChild(th);
    row.appendChild(td);
    return row;
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

    // Children: the person's individualised count, with the national
    // fertility average for context.
    if (person.children == null || person.fertility == null) {
      els.attributes.appendChild(attrRow('Children', 'N/A'));
    } else {
      els.attributes.appendChild(attrRow('Children',
        person.children + ' (' + person.fertility + ' per woman average in ' + person.country.name + ')'));
    }

    // Daily-life access: individualised outcome + national rate for context.
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

    // Reveal the profile card.
    els.profileSection.hidden = false;

    // Move focus to the profile card for accessibility.
    els.profileCard.setAttribute('tabindex', '-1');
    try { els.profileCard.focus({ preventScroll: false }); } catch (e) { els.profileCard.focus(); }
  }

  function setLoading(isLoading) {
    [els.generateBtn, els.regenerateBtn].forEach(function (btn) {
      if (!btn) return;
      btn.disabled = isLoading;
      // Pico CSS renders a spinner for aria-busy buttons (see Loading docs).
      if (isLoading) {
        btn.setAttribute('aria-busy', 'true');
      } else {
        btn.removeAttribute('aria-busy');
      }
    });
  }

  function handleGenerate(generateFn) {
    setLoading(true);
    // Let the loading state paint before the (fast) synchronous work.
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
    els.profileCard = $('profile-card');
    els.name = $('person-name');
    els.ageGender = $('person-age-gender');
    els.countryFlag = $('country-flag');
    els.countryName = $('country-name');
    els.attributes = $('profile-attributes');
    els.dataStatus = $('data-status');
    els.infoBtn = $('info-btn');
    els.infoDialog = $('info-dialog');

    var run = function () { handleGenerate(generateFn); };

    if (els.generateBtn) els.generateBtn.addEventListener('click', run);
    if (els.regenerateBtn) els.regenerateBtn.addEventListener('click', run);

    if (els.infoBtn) els.infoBtn.addEventListener('click', openDialog);
    if (els.infoDialog) {
      var closeBtns = els.infoDialog.querySelectorAll('.dialog-close');
      Array.prototype.forEach.call(closeBtns, function (closeBtn) {
        closeBtn.addEventListener('click', closeDialog);
      });
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

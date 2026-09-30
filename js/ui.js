/* ui.js — DOM controller & rendering.
 * Classic script (no ES modules). Attaches to global App namespace.
 * Exposes App.initUI(generateFn) and App.updateDataStatus().
 */
(function (global) {
  'use strict';
  var App = global.App = global.App || {};
  var doc = global.document;

  var els = {};

  var SAVED_STORAGE_KEY = 'randomLife.savedLives.v1';
  var recentLives = []; // session-only, most recent first: [{ id, person, createdAt }]
  var savedLives = []; // persisted, most recently saved first: [{ id, person, savedAt }]
  var uidCounter = 0;

  var MAX_LIVES = 5;

  function makeId() {
    uidCounter += 1;
    return 'life-' + Date.now().toString(36) + '-' + uidCounter + '-' +
      Math.floor(Math.random() * 1e9).toString(36);
  }

  function clonePerson(person) {
    try { return JSON.parse(JSON.stringify(person)); } catch (e) { return person; }
  }

  function displayNameOf(person) {
    if (!person || !person.name) return 'Unknown';
    var last = person.name.last ? person.name.last.charAt(0) + '.' : '';
    return (person.name.first + ' ' + last).trim();
  }

  function subtitleOf(person) {
    if (!person) return '';
    var parts = [];
    if (person.age != null && person.sex) parts.push(person.age + '-year-old ' + sexWord(person.sex, person.age));
    if (person.country && person.country.name) parts.push((person.country.flag || '') + ' ' + person.country.name);
    return parts.join(' — ').trim();
  }

  function loadSavedLives() {
    savedLives = [];
    try {
      var storage = global.localStorage;
      if (!storage) return;
      var raw = storage.getItem(SAVED_STORAGE_KEY);
      if (!raw) return;
      var parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) savedLives = parsed.filter(function (e) { return e && e.id && e.person; });
    } catch (e) { savedLives = []; }
  }

  function persistSavedLives() {
    try {
      if (global.localStorage) {
        global.localStorage.setItem(SAVED_STORAGE_KEY, JSON.stringify(savedLives));
      }
    } catch (e) { /* storage unavailable (private mode) */ }
  }

  function isSaved(id) {
    return savedLives.some(function (e) { return e.id === id; });
  }

  function addToRecent(person) {
    recentLives.unshift({ id: makeId(), person: clonePerson(person), createdAt: Date.now() });
    renderHistory();
  }

  function saveRecentEntry(id) {
    var found = null;
    for (var i = 0; i < recentLives.length; i++) {
      if (recentLives[i].id === id) { found = recentLives[i]; break; }
    }
    if (!found || isSaved(found.id)) return;
    savedLives.unshift({ id: found.id, person: clonePerson(found.person), savedAt: Date.now() });
    persistSavedLives();
    renderHistory();
  }

  function deleteSavedEntry(id) {
    savedLives = savedLives.filter(function (e) { return e.id !== id; });
    persistSavedLives();
    renderHistory();
  }

  function $(id) { return doc.getElementById(id); }

  function fmtMoney(n) {
    return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  }

  function sexWord(sex, age) {
    if (age <= 12) return sex === 'male' ? 'boy' : 'girl';
    if (age <= 17) return sex === 'male' ? 'teenage boy' : 'teenage girl';
    return sex === 'male' ? 'man' : 'woman';
  }

  function attrRow(label, value, cellClass) {
    var row = doc.createElement('tr');
    var th = doc.createElement('th');
    th.setAttribute('scope', 'row');
    th.textContent = label;
    var td = doc.createElement('td');
    td.textContent = value;
    if (cellClass) td.className = cellClass;
    row.appendChild(th);
    row.appendChild(td);
    return row;
  }

  function personDetailRows(person, tbody) {
    tbody.appendChild(attrRow('Age / Sex', person.age + '-year-old ' +
      sexWord(person.sex, person.age) + ', ' + (person.isUrban ? 'urban' : 'rural')));
    tbody.appendChild(attrRow('Country', (person.country.flag ? person.country.flag + ' ' : '') + person.country.name));
    tbody.appendChild(attrRow('Occupation', person.occupation.name, 'occ'));
    tbody.appendChild(attrRow('Income', person.income == null
      ? 'N/A' : '$' + fmtMoney(person.income) + '/year'));
    tbody.appendChild(attrRow('Habitation', person.habitation));
    tbody.appendChild(attrRow('Life expectancy',
      Math.round(person.lifeExpectancy) + ' years'));
    if (person.children == null || person.fertility == null) {
      tbody.appendChild(attrRow('Children', 'N/A'));
    } else {
      tbody.appendChild(attrRow('Children', String(person.children)));
    }
    function accessRow(label, has) {
      tbody.appendChild(attrRow(label, has == null ? 'N/A' : (has ? '✅' : '❌')));
    }
    if (person.electricity) accessRow('Electricity', person.electricity.has);
    if (person.water) accessRow('Drinking water', person.water.has);
    if (person.sanitation) accessRow('Sanitation', person.sanitation.has);
    if (person.internet) accessRow('Internet',
      person.internet.uses == null ? null : !!person.internet.uses);
  }

  function buildDetailsElement(person) {
    var wrap = doc.createElement('div');
    wrap.className = 'overflow-auto';
    var table = doc.createElement('table');
    var tbody = doc.createElement('tbody');
    personDetailRows(person, tbody);
    table.appendChild(tbody);
    wrap.appendChild(table);
    return wrap;
  }

  /* ---------- Life output controls (comparison) ---------- */

  function sortedCountries() {
    var list = [];
    try {
      if (App.getCountries) list = App.getCountries().slice();
    } catch (e) { list = []; }
    list.sort(function (a, b) {
      var an = a && a.name ? String(a.name) : '';
      var bn = b && b.name ? String(b.name) : '';
      return an.localeCompare(bn, 'en');
    });
    return list;
  }

  function fillCountrySelect(sel, keepValue) {
    if (!sel) return;
    var current = keepValue != null ? keepValue : sel.value;
    // Clear existing options.
    while (sel.firstChild) sel.removeChild(sel.firstChild);
    var def = doc.createElement('option');
    def.value = 'default';
    def.textContent = 'Default';
    sel.appendChild(def);
    var list = sortedCountries();
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (!c || !c.code || !c.name) continue;
      var opt = doc.createElement('option');
      opt.value = String(c.code);
      opt.textContent = (c.flag ? c.flag + ' ' : '') + c.name;
      sel.appendChild(opt);
    }
    // Restore previous selection if it still exists, else Default.
    var has = false;
    if (current) {
      for (var j = 0; j < sel.options.length; j++) {
        if (sel.options[j].value === current) { has = true; break; }
      }
    }
    sel.value = has ? current : 'default';
  }

  function makeSelect(id, options) {
    var sel = doc.createElement('select');
    sel.id = id;
    sel.name = id;
    for (var i = 0; i < options.length; i++) {
      var o = doc.createElement('option');
      o.value = options[i][0];
      o.textContent = options[i][1];
      sel.appendChild(o);
    }
    sel.value = 'default';
    return sel;
  }

  function createLifeControl(index) {
    var fieldset = doc.createElement('fieldset');
    fieldset.className = 'life-control';

    var legend = doc.createElement('legend');
    legend.className = 'life-legend';
    legend.textContent = 'Life ' + index;
    fieldset.appendChild(legend);

    var removeBtn = doc.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'life-remove-btn secondary outline';
    removeBtn.textContent = 'Remove';
    removeBtn.setAttribute('aria-label', 'Remove Life ' + index);
    removeBtn.addEventListener('click', function () {
      removeLifeControl(fieldset);
    });
    fieldset.appendChild(removeBtn);

    var fields = doc.createElement('div');
    fields.className = 'life-fields';

    var countryLabel = doc.createElement('label');
    countryLabel.textContent = 'Country';
    var countrySel = doc.createElement('select');
    countrySel.id = 'life-' + index + '-country';
    countrySel.name = countrySel.id;
    fillCountrySelect(countrySel, 'default');
    countryLabel.appendChild(countrySel);
    countryLabel.setAttribute('for', countrySel.id);
    fields.appendChild(countryLabel);

    var sexLabel = doc.createElement('label');
    sexLabel.textContent = 'Sex';
    var sexSel = makeSelect('life-' + index + '-sex', [
      ['default', 'Default'],
      ['male', 'Male'],
      ['female', 'Female']
    ]);
    sexLabel.appendChild(sexSel);
    sexLabel.setAttribute('for', sexSel.id);
    fields.appendChild(sexLabel);

    var habLabel = doc.createElement('label');
    habLabel.textContent = 'Habitation';
    var habSel = makeSelect('life-' + index + '-habitation', [
      ['default', 'Default'],
      ['urban', 'Urban'],
      ['rural', 'Rural']
    ]);
    habLabel.appendChild(habSel);
    habLabel.setAttribute('for', habSel.id);
    fields.appendChild(habLabel);

    fieldset.appendChild(fields);
    return fieldset;
  }

  function lifeControlEls() {
    if (!els.lifeControls) return [];
    return Array.prototype.slice.call(els.lifeControls.querySelectorAll('.life-control'));
  }

  function renumberLives() {
    var controls = lifeControlEls();
    for (var i = 0; i < controls.length; i++) {
      var n = i + 1;
      var fs = controls[i];
      var legend = fs.querySelector('legend');
      if (legend) legend.textContent = 'Life ' + n;
      var selects = fs.querySelectorAll('select');
      var kinds = ['country', 'sex', 'habitation'];
      for (var k = 0; k < selects.length && k < kinds.length; k++) {
        var sel = selects[k];
        var kind = kinds[k];
        // The label is the parent of the select in our markup.
        var newId = 'life-' + n + '-' + kind;
        sel.id = newId;
        sel.name = newId;
        if (sel.parentNode && sel.parentNode.tagName && sel.parentNode.tagName.toLowerCase() === 'label') {
          sel.parentNode.setAttribute('for', newId);
        }
      }
      var rm = fs.querySelector('.life-remove-btn');
      if (rm) rm.setAttribute('aria-label', 'Remove Life ' + n);
    }
    // Show remove buttons only when more than one life exists (always keep >=1).
    var showRemove = controls.length > 1;
    controls.forEach(function (fs) {
      var rm = fs.querySelector('.life-remove-btn');
      if (rm) rm.hidden = !showRemove;
    });
  }

  function updateAddButton() {
    if (!els.addLifeBtn) return;
    var count = lifeControlEls().length;
    // Hide once five lives exist; do not allow a sixth.
    els.addLifeBtn.hidden = count >= MAX_LIVES;
    els.addLifeBtn.disabled = count >= MAX_LIVES;
  }

  function addLifeControl() {
    if (!els.lifeControls) return null;
    var count = lifeControlEls().length;
    if (count >= MAX_LIVES) return null;
    var fs = createLifeControl(count + 1);
    els.lifeControls.appendChild(fs);
    renumberLives();
    updateAddButton();
    return fs;
  }

  function removeLifeControl(fieldset) {
    if (!els.lifeControls || !fieldset) return;
    var count = lifeControlEls().length;
    if (count <= 1) return; // always keep at least one life
    if (fieldset.parentNode === els.lifeControls) {
      els.lifeControls.removeChild(fieldset);
    }
    renumberLives();
    updateAddButton();
  }

  function getLifeConfigs() {
    var controls = lifeControlEls();
    if (!controls.length) {
      return [{ country: 'default', sex: 'default', habitation: 'default' }];
    }
    return controls.map(function (fs) {
      var selects = fs.querySelectorAll('select');
      // Order in markup: country, sex, habitation.
      // Preserve original country code casing for lookup (generator is case-insensitive).
      var countryRaw = selects[0] ? selects[0].value : 'default';
      var country = (!countryRaw || String(countryRaw).toLowerCase() === 'default') ? 'default' : countryRaw;
      var sexRaw = selects[1] ? selects[1].value : 'default';
      var sex = (sexRaw === 'male' || sexRaw === 'female') ? sexRaw : 'default';
      var habRaw = selects[2] ? selects[2].value : 'default';
      var hab = (habRaw === 'urban' || habRaw === 'rural') ? habRaw : 'default';
      return { country: country, sex: sex, habitation: hab };
    });
  }

  function overridesFromConfig(cfg) {
    return {
      countryCode: (!cfg || cfg.country === 'default') ? null : cfg.country,
      sex: (!cfg || cfg.sex === 'default') ? null : cfg.sex,
      habitation: (!cfg || cfg.habitation === 'default') ? null : cfg.habitation
    };
  }

  function refreshLifeCountries() {
    if (!els.lifeControls) return;
    var selects = els.lifeControls.querySelectorAll('select[id$="-country"]');
    Array.prototype.forEach.call(selects, function (sel) {
      fillCountrySelect(sel, sel.value);
    });
  }

  function renderHistoryList(listEl, emptyEl, entries, mode) {
    if (!listEl) return;
    listEl.innerHTML = '';
    if (emptyEl) emptyEl.hidden = entries.length > 0;
    entries.forEach(function (entry) {
      var li = doc.createElement('li');
      li.className = 'history-item';
      li.setAttribute('data-id', entry.id);

      var header = doc.createElement('div');
      header.className = 'history-item-header';

      var toggle = doc.createElement('button');
      toggle.type = 'button';
      toggle.className = 'history-item-toggle';
      toggle.setAttribute('aria-expanded', 'false');

      var nameSpan = doc.createElement('span');
      nameSpan.textContent = displayNameOf(entry.person);
      var subSpan = doc.createElement('span');
      subSpan.className = 'history-item-sub';
      subSpan.textContent = subtitleOf(entry.person);
      toggle.appendChild(nameSpan);
      toggle.appendChild(subSpan);

      var details = doc.createElement('div');
      details.className = 'history-item-details';
      details.hidden = true;
      details.appendChild(buildDetailsElement(entry.person));

      toggle.addEventListener('click', function () {
        var expanded = details.hidden;
        details.hidden = !expanded;
        toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      });

      header.appendChild(toggle);

      var action = doc.createElement('button');
      action.type = 'button';
      action.className = 'history-action secondary outline';
      if (mode === 'recent') {
        action.textContent = isSaved(entry.id) ? 'Saved' : 'Save';
        action.setAttribute('aria-label', 'Save ' + displayNameOf(entry.person));
        if (isSaved(entry.id)) action.disabled = true;
        action.addEventListener('click', function (e) {
          e.stopPropagation();
          saveRecentEntry(entry.id);
        });
      } else {
        action.textContent = 'Delete';
        action.setAttribute('aria-label', 'Delete ' + displayNameOf(entry.person));
        action.addEventListener('click', function (e) {
          e.stopPropagation();
          deleteSavedEntry(entry.id);
        });
      }
      header.appendChild(action);

      li.appendChild(header);
      li.appendChild(details);
      listEl.appendChild(li);
    });
  }

  function renderHistory() {
    renderHistoryList(els.recentList, els.recentEmpty, recentLives, 'recent');
    renderHistoryList(els.savedList, els.savedEmpty, savedLives, 'saved');
  }

  function switchHistoryTab(which) {
    var showRecent = which !== 'saved';
    if (els.recentPane) els.recentPane.hidden = !showRecent;
    if (els.savedPane) els.savedPane.hidden = showRecent;
    if (els.tabRecent) els.tabRecent.setAttribute('aria-selected', showRecent ? 'true' : 'false');
    if (els.tabSaved) els.tabSaved.setAttribute('aria-selected', showRecent ? 'false' : 'true');
  }

  /* ---------- Comparison rendering ---------- */

  function incomeText(person) {
    if (!person || person.income == null) return 'N/A';
    return '$' + fmtMoney(person.income) + '/year';
  }

  function childrenText(person) {
    if (!person || person.children == null || person.fertility == null) return 'N/A';
    return String(person.children);
  }

  function accessText(has) {
    if (has == null) return 'N/A';
    return has ? '✅' : '❌';
  }

  function personDisplayName(person) {
    if (!person || !person.name) return 'Unknown';
    var last = person.name.last ? person.name.last.charAt(0) + '.' : '';
    return (person.name.first + ' ' + last).trim();
  }

  function personAgeLine(person) {
    return person.age + '-year-old ' + sexWord(person.sex, person.age) +
      ', ' + (person.isUrban ? 'urban' : 'rural');
  }

  function personCountryLine(person) {
    return (person.country.flag ? person.country.flag + ' ' : '') + person.country.name;
  }

  function ensureCompareHead() {
    // The static markup has only a tbody; create a thead on demand for comparison.
    var table = els.attributes ? els.attributes.parentNode : null;
    if (!table || table.tagName.toLowerCase() !== 'table') {
      if (els.profileCard) table = els.profileCard.querySelector('table');
    }
    if (!table) return null;
    var head = table.querySelector('thead');
    if (!head) {
      head = doc.createElement('thead');
      head.id = 'profile-head';
      table.insertBefore(head, table.firstChild);
    }
    return head;
  }

  function setSingleModeVisible(isSingle) {
    if (els.profileHeader) els.profileHeader.hidden = !isSingle;
    var head = ensureCompareHead();
    if (head) head.hidden = isSingle;
    if (els.profileCard) {
      if (isSingle) els.profileCard.removeAttribute('data-lives');
      else els.profileCard.setAttribute('data-lives', 'multiple');
    }
    var table = els.attributes ? els.attributes.parentNode : null;
    if (table && table.tagName && table.tagName.toLowerCase() === 'table') {
      if (isSingle) table.removeAttribute('data-compare');
      else table.setAttribute('data-compare', 'true');
    }
  }

  function compareAttrRow(label, persons, valueFn, cellClass) {
    var row = doc.createElement('tr');
    var th = doc.createElement('th');
    th.setAttribute('scope', 'row');
    th.textContent = label;
    row.appendChild(th);
    for (var i = 0; i < persons.length; i++) {
      var td = doc.createElement('td');
      td.textContent = valueFn(persons[i]);
      if (cellClass) td.className = cellClass;
      row.appendChild(td);
    }
    return row;
  }

  function renderComparison(persons) {
    setSingleModeVisible(false);
    var head = ensureCompareHead();
    if (head) {
      head.innerHTML = '';
      var headerRow = doc.createElement('tr');
      var corner = doc.createElement('th');
      corner.setAttribute('scope', 'col');
      corner.className = 'compare-corner';
      corner.textContent = '';
      headerRow.appendChild(corner);
      for (var i = 0; i < persons.length; i++) {
        var th = doc.createElement('th');
        th.setAttribute('scope', 'col');
        th.className = 'compare-person';
        var nameDiv = doc.createElement('div');
        nameDiv.className = 'compare-name';
        nameDiv.textContent = personDisplayName(persons[i]);
        var subDiv = doc.createElement('div');
        subDiv.className = 'compare-sub';
        subDiv.textContent = personAgeLine(persons[i]);
        var countryDiv = doc.createElement('div');
        countryDiv.className = 'compare-country';
        countryDiv.textContent = personCountryLine(persons[i]);
        th.appendChild(nameDiv);
        th.appendChild(subDiv);
        th.appendChild(countryDiv);
        headerRow.appendChild(th);
      }
      head.appendChild(headerRow);
    }

    els.attributes.innerHTML = '';
    els.attributes.appendChild(compareAttrRow('Occupation', persons, function (p) { return p.occupation.name; }, 'occ'));
    els.attributes.appendChild(compareAttrRow('Income', persons, incomeText));
    els.attributes.appendChild(compareAttrRow('Habitation', persons, function (p) { return p.habitation; }));
    els.attributes.appendChild(compareAttrRow('Life expectancy', persons, function (p) {
      return Math.round(p.lifeExpectancy) + ' years';
    }));
    els.attributes.appendChild(compareAttrRow('Children', persons, childrenText));
    els.attributes.appendChild(compareAttrRow('Electricity', persons, function (p) {
      return p.electricity ? accessText(p.electricity.has) : 'N/A';
    }));
    els.attributes.appendChild(compareAttrRow('Drinking water', persons, function (p) {
      return p.water ? accessText(p.water.has) : 'N/A';
    }));
    els.attributes.appendChild(compareAttrRow('Sanitation', persons, function (p) {
      return p.sanitation ? accessText(p.sanitation.has) : 'N/A';
    }));
    els.attributes.appendChild(compareAttrRow('Internet', persons, function (p) {
      if (!p.internet) return 'N/A';
      if (p.internet.uses == null) return 'N/A';
      return accessText(!!p.internet.uses);
    }));

    // Reveal the profile card.
    els.profileSection.hidden = false;

    // Move focus to the profile card for accessibility.
    els.profileCard.setAttribute('tabindex', '-1');
    try { els.profileCard.focus({ preventScroll: false }); } catch (e) { els.profileCard.focus(); }
  }

  function renderProfiles(persons) {
    if (!persons || !persons.length) return;
    if (persons.length === 1) {
      setSingleModeVisible(true);
      renderProfile(persons[0]);
      return;
    }
    renderComparison(persons);
  }

  function renderProfile(person) {
    setSingleModeVisible(true);
    // Identity
    var displayName = person.name.first + ' ' + (person.name.last ? person.name.last.charAt(0) + '.' : '');
    els.name.textContent = displayName.trim();
    els.ageGender.textContent = person.age + '-year-old ' + sexWord(person.sex, person.age) +
      ', ' + (person.isUrban ? 'urban' : 'rural');
    els.countryFlag.textContent = person.country.flag || '';
    els.countryName.textContent = person.country.name;

    // Attributes
    els.attributes.innerHTML = '';

    els.attributes.appendChild(attrRow('Occupation', person.occupation.name, 'occ'));

    var incomeValue;
    if (person.income == null) {
      incomeValue = 'N/A';
    } else {
      incomeValue = '$' + fmtMoney(person.income) + '/year';
    }
    els.attributes.appendChild(attrRow('Income', incomeValue));

    els.attributes.appendChild(attrRow('Habitation', person.habitation));

    var leText = Math.round(person.lifeExpectancy) + ' years';
    els.attributes.appendChild(attrRow('Life expectancy', leText));

    // Children: the person's individualised count.
    if (person.children == null || person.fertility == null) {
      els.attributes.appendChild(attrRow('Children', 'N/A'));
    } else {
      els.attributes.appendChild(attrRow('Children', String(person.children)));
    }

    // Daily-life access: individualised outcome only.
    function accessRow(label, has) {
      var value;
      if (has == null) {
        value = 'N/A';
      } else {
        value = has ? '✅' : '❌';
      }
      els.attributes.appendChild(attrRow(label, value));
    }

    if (person.electricity) accessRow('Electricity', person.electricity.has);
    if (person.water) accessRow('Drinking water', person.water.has);
    if (person.sanitation) accessRow('Sanitation', person.sanitation.has);
    if (person.internet) {
      var netVal;
      if (person.internet.uses == null) {
        netVal = 'N/A';
      } else {
        netVal = person.internet.uses ? '✅' : '❌';
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
      // styles.css renders a spinner for aria-busy buttons.
      if (isLoading) {
        btn.setAttribute('aria-busy', 'true');
      } else {
        btn.removeAttribute('aria-busy');
      }
    });
  }

  function handleGenerate(generateFn) {
    setLoading(true);
    var configs;
    try {
      configs = getLifeConfigs();
    } catch (e) {
      configs = [{ country: 'default', sex: 'default', habitation: 'default' }];
    }
    // Let the loading state paint before the (fast) synchronous work.
    global.requestAnimationFrame(function () {
      global.setTimeout(function () {
        try {
          var persons = [];
          for (var i = 0; i < configs.length; i++) {
            var p = generateFn(overridesFromConfig(configs[i]));
            if (p) persons.push(p);
          }
          if (persons.length) {
            renderProfiles(persons);
            // Add each life to history (most recent first = Life 1 first).
            for (var j = persons.length - 1; j >= 0; j--) {
              addToRecent(persons[j]);
            }
          }
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

  // After a dialog closes, the browser returns focus to the button that
  // opened it — leaving Space to re-open the dialog instead of generating.
  // Release focus to the page so Space generates again on the home page.
  // (Keyboard users can still Tab back to the button and use Enter/Space.)
  function releaseInvokerFocus(btn) {
    if (btn && doc.activeElement === btn && btn.blur) btn.blur();
  }

  // History dialog handling (mirrors the info dialog pattern).
  function openHistory() {
    if (!els.historyDialog) return;
    renderHistory();
    if (els.historyBtn) els.historyBtn.setAttribute('aria-expanded', 'true');
    if (typeof els.historyDialog.showModal === 'function') {
      els.historyDialog.showModal();
    } else {
      els.historyDialog.setAttribute('open', '');
    }
  }
  function closeHistory() {
    if (!els.historyDialog) return;
    if (els.historyBtn) els.historyBtn.setAttribute('aria-expanded', 'false');
    if (typeof els.historyDialog.close === 'function' && els.historyDialog.open) {
      els.historyDialog.close();
    } else {
      els.historyDialog.removeAttribute('open');
    }
  }

  // Contact dialog handling (mirrors the history dialog pattern).
  function openContact() {
    if (!els.contactDialog) return;
    if (els.contactBtn) els.contactBtn.setAttribute('aria-expanded', 'true');
    if (typeof els.contactDialog.showModal === 'function') {
      els.contactDialog.showModal();
    } else {
      els.contactDialog.setAttribute('open', '');
    }
  }
  function closeContact() {
    if (!els.contactDialog) return;
    if (els.contactBtn) els.contactBtn.setAttribute('aria-expanded', 'false');
    if (typeof els.contactDialog.close === 'function' && els.contactDialog.open) {
      els.contactDialog.close();
    } else {
      els.contactDialog.removeAttribute('open');
    }
  }

  // Privacy dialog handling (mirrors the contact dialog pattern).
  function openPrivacy() {
    if (!els.privacyDialog) return;
    if (els.privacyBtn) els.privacyBtn.setAttribute('aria-expanded', 'true');
    if (typeof els.privacyDialog.showModal === 'function') {
      els.privacyDialog.showModal();
    } else {
      els.privacyDialog.setAttribute('open', '');
    }
  }
  function closePrivacy() {
    if (!els.privacyDialog) return;
    if (els.privacyBtn) els.privacyBtn.setAttribute('aria-expanded', 'false');
    if (typeof els.privacyDialog.close === 'function' && els.privacyDialog.open) {
      els.privacyDialog.close();
    } else {
      els.privacyDialog.removeAttribute('open');
    }
  }

  function initUI(generateFn) {
    els.generateBtn = $('generate-btn');
    els.regenerateBtn = $('regenerate-btn');
    els.profileSection = $('profile-section');
    els.profileCard = $('profile-card');
    els.profileHeader = els.profileCard ? els.profileCard.querySelector('header') : null;
    els.name = $('person-name');
    els.ageGender = $('person-age-gender');
    els.countryFlag = $('country-flag');
    els.countryName = $('country-name');
    els.attributes = $('profile-attributes');
    els.dataStatus = $('data-status');
    els.lifeControls = $('life-controls');
    els.addLifeBtn = $('add-life-btn');
    els.infoBtn = $('info-btn');
    els.infoDialog = $('info-dialog');
    els.historyBtn = $('history-btn');
    els.historyDialog = $('history-dialog');
    els.contactBtn = $('contact-btn');
    els.contactDialog = $('contact-dialog');
    els.privacyBtn = $('privacy-btn');
    els.privacyDialog = $('privacy-dialog');
    els.tabRecent = $('history-tab-recent');
    els.tabSaved = $('history-tab-saved');
    els.recentPane = $('history-recent-pane');
    els.savedPane = $('history-saved-pane');
    els.recentList = $('history-recent-list');
    els.savedList = $('history-saved-list');
    els.recentEmpty = $('history-recent-empty');
    els.savedEmpty = $('history-saved-empty');

    var run = function () { handleGenerate(generateFn); };

    // Life comparison controls: start with exactly one life, all Default.
    if (els.lifeControls) {
      els.lifeControls.innerHTML = '';
      els.lifeControls.appendChild(createLifeControl(1));
      renumberLives();
      updateAddButton();
    }
    if (els.addLifeBtn) {
      els.addLifeBtn.addEventListener('click', function () {
        addLifeControl();
        // Keep focus management simple: leave focus on the add button unless
        // it just became hidden (5 lives), then move focus to the last life.
        if (els.addLifeBtn.hidden) {
          var controls = lifeControlEls();
          var last = controls[controls.length - 1];
          if (last) {
            var sel = last.querySelector('select');
            if (sel) { try { sel.focus(); } catch (e) { /* ignore */ } }
          }
        }
      });
    }

    // Release focus for mouse/touch-activated buttons so the highlight does
    // not stick until the next click elsewhere. Keyboard activation
    // (click event with detail === 0) keeps focus for accessibility.
    doc.addEventListener('click', function (e) {
      if (!e || e.detail <= 0) return;
      var t = e.target && e.target.closest ? e.target.closest('button, [role=button]') : null;
      if (t && t.blur) t.blur();
    });

    if (els.generateBtn) els.generateBtn.addEventListener('click', run);
    if (els.regenerateBtn) els.regenerateBtn.addEventListener('click', run);

    // Space bar generates a new life on desktop, except when focus is on an
    // interactive element (where Space has its normal role: activating
    // buttons/links, typing in fields) or a dialog is open (where Space
    // scrolls). Held-down repeats and modifier combos are ignored.
    doc.addEventListener('keydown', function (e) {
      if (!e || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code !== 'Space' && e.key !== ' ' && e.key !== 'Spacebar') return;
      if ((els.infoDialog && els.infoDialog.open) || (els.historyDialog && els.historyDialog.open) || (els.contactDialog && els.contactDialog.open) || (els.privacyDialog && els.privacyDialog.open)) return;
      var active = doc.activeElement;
      if (active) {
        var tag = (active.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select' || active.isContentEditable) return;
        if (tag === 'button' || tag === 'summary' || tag === 'a' ||
            (active.getAttribute && active.getAttribute('role') === 'button')) return;
      }
      e.preventDefault();
      run();
    });

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
        releaseInvokerFocus(els.infoBtn);
      });
    }

    loadSavedLives();

    if (els.historyBtn) els.historyBtn.addEventListener('click', openHistory);
    if (els.tabRecent) els.tabRecent.addEventListener('click', function () { switchHistoryTab('recent'); });
    if (els.tabSaved) els.tabSaved.addEventListener('click', function () { switchHistoryTab('saved'); });
    if (els.historyDialog) {
      var historyCloseBtns = els.historyDialog.querySelectorAll('.dialog-close');
      Array.prototype.forEach.call(historyCloseBtns, function (closeBtn) {
        closeBtn.addEventListener('click', closeHistory);
      });
      els.historyDialog.addEventListener('click', function (e) {
        if (e.target === els.historyDialog) closeHistory();
      });
      els.historyDialog.addEventListener('close', function () {
        if (els.historyBtn) els.historyBtn.setAttribute('aria-expanded', 'false');
        releaseInvokerFocus(els.historyBtn);
      });
    }

    if (els.contactBtn) els.contactBtn.addEventListener('click', openContact);
    if (els.contactDialog) {
      var contactCloseBtns = els.contactDialog.querySelectorAll('.dialog-close');
      Array.prototype.forEach.call(contactCloseBtns, function (closeBtn) {
        closeBtn.addEventListener('click', closeContact);
      });
      // Click on backdrop closes. (Clicks on the form itself must not close it.)
      els.contactDialog.addEventListener('click', function (e) {
        if (e.target === els.contactDialog) closeContact();
      });
      els.contactDialog.addEventListener('close', function () {
        if (els.contactBtn) els.contactBtn.setAttribute('aria-expanded', 'false');
        releaseInvokerFocus(els.contactBtn);
      });
    }

    if (els.privacyBtn) els.privacyBtn.addEventListener('click', openPrivacy);
    if (els.privacyDialog) {
      var privacyCloseBtns = els.privacyDialog.querySelectorAll('.dialog-close');
      Array.prototype.forEach.call(privacyCloseBtns, function (closeBtn) {
        closeBtn.addEventListener('click', closePrivacy);
      });
      // Click on backdrop closes.
      els.privacyDialog.addEventListener('click', function (e) {
        if (e.target === els.privacyDialog) closePrivacy();
      });
      els.privacyDialog.addEventListener('close', function () {
        if (els.privacyBtn) els.privacyBtn.setAttribute('aria-expanded', 'false');
        releaseInvokerFocus(els.privacyBtn);
      });
    }

    renderHistory();
    updateDataStatus();
  }

  App.initUI = initUI;
  App.updateDataStatus = updateDataStatus;
  App.renderProfile = renderProfile;
  App.renderProfiles = renderProfiles;
  App.renderComparison = renderComparison;
  App.getLifeConfigs = getLifeConfigs;
  App.refreshLifeCountries = refreshLifeCountries;
  App.addLifeControl = addLifeControl;
  App.MAX_LIVES = MAX_LIVES;
  App.getRecentLives = function () { return recentLives; };
  App.getSavedLives = function () { return savedLives; };
})(typeof window !== 'undefined' ? window : this);

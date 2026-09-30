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

  function personDetailRows(person, tbody) {
    tbody.appendChild(attrRow('Age / Sex', person.age + '-year-old ' +
      sexWord(person.sex, person.age) + ', ' + (person.isUrban ? 'urban' : 'rural')));
    tbody.appendChild(attrRow('Country', (person.country.flag ? person.country.flag + ' ' : '') + person.country.name));
    tbody.appendChild(attrRow('Occupation', person.occupation.name));
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
    // Let the loading state paint before the (fast) synchronous work.
    global.requestAnimationFrame(function () {
      global.setTimeout(function () {
        try {
          var person = generateFn();
          if (person) {
            renderProfile(person);
            addToRecent(person);
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
    els.name = $('person-name');
    els.ageGender = $('person-age-gender');
    els.countryFlag = $('country-flag');
    els.countryName = $('country-name');
    els.attributes = $('profile-attributes');
    els.dataStatus = $('data-status');
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
  App.getRecentLives = function () { return recentLives; };
  App.getSavedLives = function () { return savedLives; };
})(typeof window !== 'undefined' ? window : this);

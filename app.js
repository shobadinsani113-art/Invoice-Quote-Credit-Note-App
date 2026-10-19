/* app.js — events, dialogs, the live editor, printing, logo upload, keyboard shortcuts and start-up */
(function () {
  'use strict';
  var N = window.INVOICES = window.INVOICES || {};
  var core = N.core, ui = N.ui, esc = ui.esc, I = ui.I;
  function $(s, r) { return (r || document).querySelector(s); }
  function $all(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function num(v) { if (v === '' || v == null) return null; var n = parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : null; }

  var t0 = core.today(), m0 = core.presetRange('month', t0);
  var view = { tab: 'today', kind: 'all', status: 'all', client: 'all', search: '', selected: null, docOpen: false,
    editing: null, editorMode: 'edit', activeLine: null, landStamp: null, repPreset: 'month', repFrom: m0.from, repTo: m0.to };
  var lastDay = t0;

  /* ============ THEME & RENDER ============ */
  function isDark() { var t = core.state.settings.theme; if (t === 'dark') return true; if (t === 'light') return false; return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches); }
  function applyTheme() { var t = core.state.settings.theme; if (t === 'system') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t); }
  function render() {
    applyTheme();
    document.title = core.state.settings.profile.name + ', invoices';
    $all('.rail-btn[data-tab]').forEach(function (b) { b.setAttribute('aria-current', b.dataset.tab === view.tab ? 'page' : 'false'); });
    var active = document.activeElement, id = active && active.id, caret = null;
    try { caret = id && active.selectionStart != null ? [active.selectionStart, active.selectionEnd] : null; } catch (e) { caret = null; }
    var d = view.editing ? core.doc(view.editing) : null;
    if (view.editing && (!d || d.status !== 'draft')) { view.editing = null; d = null; }
    var html = d ? ui.editor(d) : ({ today: ui.today, documents: ui.documents, clients: ui.clients, items: ui.items, reports: ui.reports, settings: ui.settings })[view.tab]();
    $('#view').innerHTML = html;
    if (id) { var el = document.getElementById(id); if (el && el.closest('#view')) { el.focus(); if (caret) try { el.setSelectionRange(caret[0], caret[1]); } catch (e) { /* not text */ } } }
    $('#saveWarn').hidden = !core.saveError();
    if (view.landStamp) setTimeout(function () { view.landStamp = null; }, 400);
  }
  function go(tab) { view.tab = tab; view.editing = null; view.docOpen = false; render(); window.scrollTo(0, 0); }
  function openDoc(id) { view.tab = 'documents'; view.editing = null; view.selected = id; view.docOpen = true; render(); window.scrollTo(0, 0); }
  function openEditor(id) { view.editing = id; view.editorMode = 'edit'; view.activeLine = null; render(); window.scrollTo(0, 0); }

  /* ============ TOAST & DIALOGS ============ */
  var toastTimer;
  function toast(msg, bad) { var t = $('#toast'); t.textContent = msg; t.className = 'toast show' + (bad ? ' bad' : ''); clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.className = 'toast'; }, 2800); }
  function attempt(fn) { try { var r = fn(); return r === undefined ? true : r; } catch (e) { toast(e.message, true); return false; } }
  var stack = [];
  function openDialog(o) {
    var ov = document.createElement('div'); ov.className = 'overlay';
    ov.innerHTML = '<div class="dialog' + (o.wide ? ' dialog-wide' : '') + (o.small ? ' dialog-small' : '') + '" role="dialog" aria-modal="true" aria-labelledby="dlg' + stack.length + '"><div class="dialog-head"><h2 id="dlg' + stack.length + '">' + esc(o.title) + '</h2><button type="button" class="btn btn-line btn-icon" data-close aria-label="Close">' + I.x + '</button></div>' +
      '<div class="dialog-body">' + (o.body || '') + '</div>' + (o.foot === false ? '' : '<div class="dialog-foot">' + (o.foot || '') + '</div>') + '</div>';
    $('#dialogs').appendChild(ov);
    var d = { el: ov, returnTo: document.activeElement, onClose: o.onClose, body: function (h) { $('.dialog-body', ov).innerHTML = h; }, close: function () { closeDialog(d); } };
    stack.push(d); document.body.classList.add('no-scroll');
    ov.addEventListener('mousedown', function (e) { if (e.target === ov) d.close(); });
    ov.addEventListener('click', function (e) { if (e.target.closest('[data-close]')) d.close(); });
    if (o.onMount) o.onMount(d);
    setTimeout(function () { var f = $(o.focus || '.dialog-body input, .dialog-body select, .dialog-body textarea', ov) || $('.dialog-foot .btn-primary', ov); if (f) f.focus(); }, 30);
    return d;
  }
  function closeDialog(d) { var i = stack.indexOf(d); if (i === -1) return; stack.splice(i, 1); d.el.remove(); if (!stack.length) document.body.classList.remove('no-scroll'); if (d.onClose) d.onClose(); if (d.returnTo && document.contains(d.returnTo)) d.returnTo.focus(); }
  function confirmDialog(title, html, okText, danger) {
    return new Promise(function (resolve) {
      var done = false;
      openDialog({ title: title, small: true, body: html, foot: '<button type="button" class="btn btn-line" data-close>Cancel</button><button type="button" class="btn ' + (danger ? 'btn-danger' : 'btn-primary') + '" data-ok>' + esc(okText) + '</button>',
        onClose: function () { if (!done) resolve(false); }, onMount: function (d) { $('[data-ok]', d.el).addEventListener('click', function () { done = true; d.close(); resolve(true); }); } });
    });
  }
  function formDialog(o) {
    return openDialog({ title: o.title, small: o.small, wide: o.wide, body: o.body, focus: o.focus,
      foot: (o.leftFoot || '') + '<button type="button" class="btn btn-line" data-close>Cancel</button><button type="button" class="btn btn-primary" data-save>' + esc(o.saveText || 'Save') + '</button>',
      onMount: function (d) {
        $('[data-save]', d.el).addEventListener('click', function () { if (o.onSave(d)) d.close(); });
        d.el.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); if (o.onSave(d)) d.close(); } });
        if (o.onMount) o.onMount(d);
      } });
  }

  /* ============ DOWNLOAD & PRINT ============ */
  function download(name, text, type) { var blob = new Blob([text], { type: type }), url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 1500); }
  function printDoc(d) {
    var size = core.state.settings.paper === 'Letter' ? 'letter' : 'A4';
    var style = document.getElementById('pageStyle') || document.head.appendChild(Object.assign(document.createElement('style'), { id: 'pageStyle' }));
    style.textContent = '@page { size: ' + size + '; margin: 0; }';
    $('#printArea').innerHTML = ui.paper(d, { print: true });
    var done = false; function cleanup() { if (done) return; done = true; $('#printArea').innerHTML = ''; }
    window.addEventListener('afterprint', cleanup, { once: true });
    setTimeout(function () { window.print(); setTimeout(cleanup, 1500); }, 60);
  }
  function openPdfTip(d) {
    openDialog({ title: 'Download PDF', small: true,
      body: '<p>In the print dialog:</p><ol style="margin:0;padding-left:20px;line-height:1.7"><li>Choose <b>Save as PDF</b> as the destination.</li><li>Set margins to <b>Default</b> or <b>None</b>.</li><li>Turn off <b>Headers and footers</b>.</li></ol><p class="hint">Only the document is printed, at ' + esc(core.state.settings.paper) + ' size.</p>',
      foot: '<button type="button" class="btn btn-line" data-close>Cancel</button><button type="button" class="btn btn-primary" data-go>' + I.pdf + 'Open print dialog</button>',
      onMount: function (dlg) { $('[data-go]', dlg.el).addEventListener('click', function () { dlg.close(); printDoc(d); }); } });
  }

  /* ============ EDITOR (live paper) ============ */
  var saveTimer = null;
  function currentDraft() { return view.editing ? core.doc(view.editing) : null; }
  function refreshPaper() {
    var d = currentDraft(); if (!d) return;
    var host = $('#paperHost'); if (host) host.innerHTML = ui.paper(d, { highlight: view.activeLine });
    var t = core.totals(d);
    d.lines.forEach(function (l, i) { var a = $('[data-amt="' + l.id + '"]'); if (a) a.textContent = core.moneyMinor(t.lines[i], d.currency); });
    var st = $('#stickyTotal'); if (st) st.textContent = core.moneyMinor(t.total, d.currency);
    if (view.activeLine) { var row = host && host.querySelector('tr.is-hl'), col = $('.preview-col'); if (row && col && col.scrollHeight > col.clientHeight) { var rt = row.getBoundingClientRect(), ct = col.getBoundingClientRect(); if (rt.top < ct.top + 40 || rt.bottom > ct.bottom - 40) col.scrollTop += rt.top - ct.top - ct.height / 3; } }
  }
  function patchDraft(patch, rerender) {
    var d = currentDraft(); if (!d) return;
    attempt(function () { core.updateDraft(d.id, patch); });
    if (rerender) render(); else refreshPaper();
  }
  function lineIndex(el) { var d = currentDraft(), lid = el.closest('[data-line]').dataset.line; for (var i = 0; i < d.lines.length; i++) if (d.lines[i].id === lid) return i; return -1; }
  function addLine(fromItem) {
    var d = currentDraft(), s = core.state.settings, lines = d.lines.slice();
    var l = fromItem ? { id: core.uid('l'), description: fromItem.name + (fromItem.description ? ' — ' + fromItem.description : ''), qty: 1, price: fromItem.price, taxRateId: fromItem.taxRateId }
      : { id: core.uid('l'), description: '', qty: 1, price: 0, taxRateId: s.taxRates[0] ? s.taxRates[0].id : core.NO_TAX };
    lines.push(l); view.activeLine = l.id; patchDraft({ lines: lines }, true);
    var ta = $('[data-line="' + l.id + '"] textarea'); if (ta) ta.focus();
  }
  document.addEventListener('input', function (e) {
    if (e.target.closest('.overlay')) return;
    var t = e.target, d = currentDraft();
    if (d && t.closest('.form-col')) {
      if (t.dataset.lf) {
        var i = lineIndex(t), lines = core.clone(d.lines), f = t.dataset.lf;
        lines[i][f] = f === 'qty' || f === 'price' ? (num(t.value) === null ? 0 : num(t.value)) : t.value;
        d.lines = lines; refreshPaper(); clearTimeout(saveTimer); saveTimer = setTimeout(function () { patchDraft({ lines: currentDraft().lines }); }, 250); return;
      }
      var map = { eDate: 'date', eDue: 'due', eValid: 'validUntil', eNotes: 'notes', eFooter: 'footer' };
      if (map[t.id]) { var p = {}; p[map[t.id]] = t.value; if (t.id === 'eDate' && !core.isDate(t.value)) return; patchDraft(p, false); if (t.id === 'eDate' && d.kind === 'invoice' && d.terms !== 'custom') { var hint = t.closest('.grid-2').querySelector('.hint'); if (hint) hint.textContent = 'Due ' + ui.dfmt(currentDraft().due); } return; }
      if (t.id === 'eDiscVal') { patchDraft({ discount: { type: d.discount.type, value: num(t.value) || 0 } }, false); return; }
    }
    if (t.id === 'fSearch') { view.search = t.value; render(); }
  });
  document.addEventListener('change', function (e) {
    if (e.target.closest('.overlay')) return;
    var t = e.target, d = currentDraft();
    if (d && t.closest('.form-col')) {
      if (t.dataset.lf === 'taxRateId') { var i = lineIndex(t), lines = core.clone(d.lines); lines[i].taxRateId = t.value; patchDraft({ lines: lines }, false); return; }
      if (t.id === 'eClient') { var c = core.client(t.value); patchDraft(c ? { clientId: c.id, currency: c.currency, terms: d.kind === 'invoice' ? c.terms : d.terms } : { clientId: '' }, true); return; }
      if (t.id === 'eCurrency') { patchDraft({ currency: t.value }, true); return; }
      if (t.id === 'eTerms') { patchDraft({ terms: t.value, due: t.value === 'custom' ? (d.due || d.date) : d.due }, true); return; }
      if (t.id === 'eDiscType') { patchDraft({ discount: { type: t.value, value: d.discount.value } }, false); return; }
      if (t.id === 'eCatalog' && t.value) { addLine(core.item(t.value)); return; }
    }
    if (t.id === 'fStatus') { view.status = t.value; render(); }
    else if (t.id === 'fClient') { view.client = t.value; render(); }
    else if (t.id === 'rFrom' || t.id === 'rTo') { if (t.value) view[t.id === 'rFrom' ? 'repFrom' : 'repTo'] = t.value; render(); }
    else if (t.dataset.profile) { var pp = {}; pp[t.dataset.profile] = t.value.trim(); core.updateProfile(pp); toast('Profile saved'); }
    else if (t.dataset.prefix) { var v = t.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, ''); if (!v) { toast('Enter a prefix of letters or digits.', true); render(); return; } var px = core.clone(core.state.settings.prefixes); px[t.dataset.prefix] = v; core.updateSettings({ prefixes: px }); toast('Prefix saved'); render(); }
    else if (t.dataset.set) { var val = t.hasAttribute('data-num') ? parseInt(t.value, 10) : t.value; if (t.hasAttribute('data-num') && (!val || val < 1)) { toast('Enter a whole number of 1 or more.', true); render(); return; } var o = {}; o[t.dataset.set] = val; core.updateSettings(o); toast('Settings saved'); render(); }
  });
  document.addEventListener('focusin', function (e) {
    var line = e.target.closest && e.target.closest('.form-col [data-line]');
    if (line && view.activeLine !== line.dataset.line) { view.activeLine = line.dataset.line; $all('.line').forEach(function (l) { l.classList.toggle('is-active', l === line); }); refreshPaper(); }
  });
  document.addEventListener('keydown', function (e) {
    var t = e.target;
    if (e.key === 'Enter' && t.dataset && t.dataset.lf === 'price') { var d = currentDraft(); if (d && lineIndex(t) === d.lines.length - 1) { e.preventDefault(); patchDraft({ lines: d.lines }); addLine(null); } return; }
    var row = t.closest && t.closest('[role="button"][data-action], tr[data-action]');
    if (row && (e.key === 'Enter' || e.key === ' ') && !/^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(t.tagName)) { e.preventDefault(); row.click(); return; }
    if (e.key === 'Escape') { if (stack.length) { stack[stack.length - 1].close(); e.preventDefault(); } return; }
    if (stack.length || /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'n' || e.key === 'N') { e.preventDefault(); actions['new-invoice'](); }
    else if (e.key === 'q' || e.key === 'Q') { e.preventDefault(); actions['new-quote'](); }
    else if (e.key === '/') { e.preventDefault(); go('documents'); var s = $('#fSearch'); if (s) s.focus(); }
  });

  /* ============ DIALOGS: payments, reminders, schedules ============ */
  function openPayment(d, kind) {
    var bal = core.balanceInfo(d).balance, cur = d.currency, amt = core.fromMinor(kind === 'refund' ? -bal : bal, cur);
    formDialog({ title: (kind === 'refund' ? 'Record refund for ' : 'Record payment for ') + d.number, small: true, saveText: kind === 'refund' ? 'Record refund' : 'Record payment',
      body: '<p class="note">' + (kind === 'refund' ? 'Owed to the client: ' : 'Balance: ') + '<b>' + esc(core.money(amt, cur)) + '</b></p><div class="grid-2"><label class="field"><span>Amount (' + cur + ')</span><input type="number" id="pAmt" min="0" step="any" value="' + amt.toFixed(core.digits(cur)) + '"/></label><label class="field"><span>Date</span><input type="date" id="pDate" value="' + core.today() + '"/></label></div>' +
        '<label class="field"><span>Method</span><input type="text" id="pMethod" list="methods" value="Bank transfer"/><datalist id="methods"><option>Bank transfer</option><option>Card</option><option>PayPal</option><option>Cash</option></datalist></label><label class="field"><span>Note (optional)</span><input type="text" id="pNote" maxlength="80"/></label>',
      onSave: function (dlg) {
        var before = core.status(d);
        var okRes = attempt(function () { core.recordPayment(d.id, { amount: num($('#pAmt', dlg.el).value), date: $('#pDate', dlg.el).value, method: $('#pMethod', dlg.el).value, note: $('#pNote', dlg.el).value }, kind); });
        if (!okRes) return false;
        if (core.status(d) === 'paid' && before !== 'paid') view.landStamp = d.id;
        toast(kind === 'refund' ? 'Refund recorded' : 'Payment recorded'); render(); return true;
      } });
  }
  function openReminder(d) {
    var today = core.today(), tone = core.suggestedTone(d, today);
    function body() {
      var r = core.reminderText(d, tone, today), cl = core.client(d.clientId);
      return '<div class="switch2">' + [['friendly', 'Friendly'], ['firm', 'Firm'], ['final', 'Final']].map(function (x) { return '<button type="button" aria-pressed="' + (tone === x[0]) + '" data-tone="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</div>' +
        '<p><b>To:</b> ' + esc(cl && cl.email ? cl.email : 'no email saved for this client') + '<br><b>Subject:</b> ' + esc(r.subject) + '</p><pre class="reminder-text">' + esc(r.body) + '</pre>' +
        '<p class="note">The PDF is not attached automatically. Use Download PDF to save it, then attach it to your email.</p>' +
        (d.reminders.length ? '<p class="hint">Reminders sent: ' + esc(d.reminders.map(function (x) { return x.date + ' (' + x.tone + ')'; }).join(', ')) + '</p>' : '');
    }
    openDialog({ title: 'Remind about ' + d.number, wide: true, body: body(),
      foot: '<button type="button" class="btn btn-line" data-pdf>' + I.pdf + 'Download PDF</button><button type="button" class="btn btn-line" data-copy>Copy text</button><button type="button" class="btn btn-primary" data-mail>' + I.mail + 'Open in email app</button>',
      onMount: function (dlg) {
        dlg.el.addEventListener('click', function (e) {
          var b = e.target.closest('[data-tone]'); if (b) { tone = b.dataset.tone; dlg.body(body()); return; }
          var r = core.reminderText(d, tone, today), cl = core.client(d.clientId);
          if (e.target.closest('[data-copy]')) {
            var text = 'Subject: ' + r.subject + '\n\n' + r.body;
            var done = function () { core.recordReminder(d.id, tone, today); toast('Reminder text copied'); dlg.body(body()); render(); };
            if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); }); else { fallbackCopy(text); done(); }
          }
          if (e.target.closest('[data-mail]')) {
            var a = document.createElement('a'); a.href = 'mailto:' + encodeURIComponent(cl && cl.email ? cl.email : '') + '?subject=' + encodeURIComponent(r.subject) + '&body=' + encodeURIComponent(r.body);
            document.body.appendChild(a); a.click(); a.remove(); core.recordReminder(d.id, tone, today); toast('Reminder opened in your email app'); dlg.body(body()); render();
          }
          if (e.target.closest('[data-pdf]')) openPdfTip(d);
        });
      } });
  }
  function fallbackCopy(text) { var ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) { /* ignore */ } ta.remove(); }
  function openRepeat(d) {
    var start = core.shiftMonth(d.date, 1);
    formDialog({ title: 'Repeat ' + d.number, small: true, saveText: 'Create schedule',
      body: '<p class="hint">New invoices copy this one’s client, currency, terms and lines.</p><div class="grid-2"><label class="field"><span>How often</span><select id="sFreq"><option value="monthly">Monthly</option><option value="weekly">Weekly</option><option value="yearly">Yearly</option></select></label>' +
        '<label class="field"><span>First invoice on</span><input type="date" id="sStart" value="' + start + '"/></label><label class="field"><span>End (optional)</span><input type="date" id="sEnd"/></label>' +
        '<label class="field"><span>When a date arrives</span><select id="sMode"><option value="draft">Create a draft to review</option><option value="issue">Issue it automatically</option></select></label></div>',
      onSave: function (dlg) {
        var res = attempt(function () { return core.createSchedule(d.id, { freq: $('#sFreq', dlg.el).value, start: $('#sStart', dlg.el).value, end: $('#sEnd', dlg.el).value || null, mode: $('#sMode', dlg.el).value }); });
        if (!res) return false;
        var made = core.processSchedules(core.today());
        toast(made.length ? 'Schedule created. ' + made.length + ' invoice' + (made.length > 1 ? 's' : '') + ' created for past dates.' : 'Schedule created'); render(); return true;
      } });
  }

  /* ============ CLIENTS & ITEMS ============ */
  function readClient(dlg, id) { return { id: id, name: $('#cName', dlg.el).value, contact: $('#cContact', dlg.el).value, email: $('#cEmail', dlg.el).value, taxId: $('#cTax', dlg.el).value, currency: $('#cCur', dlg.el).value, terms: $('#cTerms', dlg.el).value, address: $('#cAddr', dlg.el).value }; }
  function openClientForm(cl, after) {
    var s = core.state.settings, data = cl || { name: '', contact: '', email: '', taxId: '', currency: s.currency, terms: s.terms, address: '' };
    formDialog({ title: cl ? 'Edit client' : 'Add client', body: ui.clientForm(data), saveText: cl ? 'Save client' : 'Add client',
      onSave: function (dlg) { var res = attempt(function () { return core.saveClient(readClient(dlg, cl ? cl.id : null)); }); if (!res) return false; toast(cl ? 'Client saved' : 'Client added'); if (after) after(res); else render(); return true; } });
  }
  function openClient(id) {
    var cl = core.client(id);
    openDialog({ title: cl.name, wide: true, body: ui.clientDetail(cl),
      foot: '<button type="button" class="btn btn-ghost-danger" data-del style="margin-right:auto">' + I.trash + 'Delete</button><button type="button" class="btn btn-line" data-arch>' + (cl.archived ? 'Unarchive' : 'Archive') + '</button><button type="button" class="btn btn-line" data-edit>' + I.edit + 'Edit</button><button type="button" class="btn btn-primary" data-inv>New invoice</button>',
      onMount: function (dlg) {
        dlg.el.addEventListener('click', function (e) {
          var o = e.target.closest('[data-doc-open]'); if (o) { dlg.close(); openDoc(o.dataset.docOpen); return; }
          if (e.target.closest('[data-edit]')) { dlg.close(); openClientForm(cl); }
          if (e.target.closest('[data-arch]')) { core.setClientArchived(cl.id, !cl.archived); dlg.close(); toast(cl.archived ? 'Client archived' : 'Client restored'); render(); }
          if (e.target.closest('[data-inv]')) { dlg.close(); var d = core.newDraft('invoice', { clientId: cl.id }); openEditor(d.id); }
          if (e.target.closest('[data-del]')) confirmDialog('Delete ' + cl.name + '?', '<p>Clients with issued documents can only be archived.</p>', 'Delete client', true).then(function (y) { if (y && attempt(function () { core.deleteClient(cl.id); })) { dlg.close(); toast('Client deleted'); render(); } });
        });
      } });
  }
  function openItem(it) {
    var s = core.state.settings, data = it || { name: '', description: '', price: '', taxRateId: s.taxRates[0] ? s.taxRates[0].id : core.NO_TAX };
    formDialog({ title: it ? 'Edit item' : 'Add item', small: true, body: ui.itemForm(data), saveText: it ? 'Save item' : 'Add item',
      leftFoot: it ? '<button type="button" class="btn btn-ghost-danger" data-del style="margin-right:auto">' + I.trash + 'Delete</button><button type="button" class="btn btn-line" data-arch>' + (it.archived ? 'Unarchive' : 'Archive') + '</button>' : '',
      onSave: function (dlg) { var res = attempt(function () { return core.saveItem({ id: it ? it.id : null, name: $('#iName', dlg.el).value, description: $('#iDesc', dlg.el).value, price: num($('#iPrice', dlg.el).value), taxRateId: $('#iTax', dlg.el).value }); }); if (!res) return false; toast(it ? 'Item saved' : 'Item added'); render(); return true; },
      onMount: function (dlg) {
        dlg.el.addEventListener('click', function (e) {
          if (e.target.closest('[data-arch]')) { core.setItemArchived(it.id, !it.archived); dlg.close(); render(); }
          if (e.target.closest('[data-del]')) { core.deleteItem(it.id); dlg.close(); toast('Item deleted'); render(); }
        });
      } });
  }
  function openRate(r) {
    formDialog({ title: r ? 'Edit tax rate' : 'Add tax rate', small: true, saveText: 'Save tax rate',
      body: '<div class="grid-2"><label class="field"><span>Name</span><input type="text" id="tName" maxlength="30" value="' + esc(r ? r.name : '') + '" placeholder="e.g. VAT 20%"/></label><label class="field"><span>Rate (%)</span><input type="number" id="tRate" min="0" max="100" step="any" value="' + esc(r ? r.rate : '') + '"/></label></div>' + (r && core.taxRateUsed(r.id) ? '<p class="hint">Issued documents keep the rate they were issued with.</p>' : ''),
      onSave: function () { var res = attempt(function () { core.saveTaxRate({ id: r ? r.id : null, name: $('#tName').value, rate: num($('#tRate').value) }); }); if (res) { toast('Tax rate saved'); render(); } return res; } });
  }

  /* ============ LOGO ============ */
  $('#logoFile').addEventListener('change', function (e) {
    var f = e.target.files && e.target.files[0]; e.target.value = ''; if (!f) return;
    if (['image/png', 'image/jpeg'].indexOf(f.type) === -1) return toast('Choose a PNG or JPG image. Other formats, including SVG, are not accepted.', true);
    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        var w = Math.min(400, img.naturalWidth), h = Math.round(img.naturalHeight * w / img.naturalWidth), cv = document.createElement('canvas');
        cv.width = w; cv.height = h; var ctx = cv.getContext('2d');
        if (f.type === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); }
        ctx.drawImage(img, 0, 0, w, h);
        var url = cv.toDataURL(f.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.88);
        if (url.length * 0.75 > 300 * 1024) return toast('This logo is still larger than 300 KB after resizing. Try a simpler image.', true);
        core.updateSettings({ logo: url }); toast('Logo saved'); render();
      };
      img.onerror = function () { toast('This image could not be read.', true); };
      img.src = reader.result;
    };
    reader.readAsDataURL(f);
  });

  /* ============ ACTIONS ============ */
  function docFrom(b) { return core.doc(b.dataset.id); }
  var actions = {
    'new-invoice': function () { var d = core.newDraft('invoice'); openEditor(d.id); },
    'new-quote': function () { var d = core.newDraft('quote'); openEditor(d.id); },
    'open-doc': function (b) { openDoc(b.dataset.id); },
    'select-doc': function (b) { view.selected = b.dataset.id; view.docOpen = true; render(); if (window.innerWidth < 900) window.scrollTo(0, 0); },
    'close-doc': function () { view.docOpen = false; render(); },
    'kind': function (b) { view.kind = b.dataset.id; render(); },
    'edit': function (b) { openEditor(b.dataset.id); },
    'editor-done': function () { var d = currentDraft(); if (d) core.updateDraft(d.id, { lines: d.lines }); var id = view.editing; view.editing = null; toast('Draft saved'); openDoc(id); },
    'mode': function (b) { view.editorMode = b.dataset.id; render(); },
    'taxmode': function (b) { patchDraft({ taxMode: b.dataset.id }, true); },
    'add-line': function () { addLine(null); },
    'new-client-inline': function () { openClientForm(null, function (c) { patchDraft({ clientId: c.id, currency: c.currency, terms: currentDraft().kind === 'invoice' ? c.terms : currentDraft().terms }, true); }); },
    'issue': function (b) {
      var d = docFrom(b); if (view.editing) core.updateDraft(d.id, { lines: d.lines });
      var kind = core.KIND_LABEL[d.kind].toLowerCase();
      confirmDialog('Issue this ' + kind + '?', '<p>It gets the number <b>' + esc(core.formatNumber(d.kind, core.parts(d.date).y, core.nextNumberPreview(d.kind, core.parts(d.date).y))) + '</b> and can no longer be edited' + (d.kind === 'invoice' ? '. Corrections are made with a credit note.' : '.') + '</p>', 'Issue ' + kind).then(function (y) {
        if (!y) return; if (attempt(function () { core.issue(d.id); })) { toast(core.KIND_LABEL[d.kind] + ' issued as ' + d.number); view.editing = null; openDoc(d.id); }
      });
    },
    'delete': function (b) { var d = docFrom(b); confirmDialog('Delete this draft?', '<p>The draft is removed. Drafts have no number, so nothing is skipped.</p>', 'Delete draft', true).then(function (y) { if (y && attempt(function () { core.deleteDraft(d.id); })) { view.editing = null; view.selected = null; toast('Draft deleted'); go('documents'); } }); },
    'pay': function (b) { openPayment(docFrom(b), 'payment'); },
    'refund': function (b) { openPayment(docFrom(b), 'refund'); },
    'remind': function (b) { openReminder(docFrom(b)); },
    'credit': function (b) { var c = attempt(function () { return core.createCredit(b.dataset.id); }); if (c) { toast('Credit note draft created. Keep only the lines you are crediting.'); openEditor(c.id); } },
    'repeat': function (b) { openRepeat(docFrom(b)); },
    'convert': function (b) { var inv = attempt(function () { return core.convertQuote(b.dataset.id); }); if (inv) { toast('Quote converted to a draft invoice'); openEditor(inv.id); } },
    'accept': function (b) { if (attempt(function () { core.setQuoteStatus(b.dataset.id, 'accepted'); })) { toast('Quote marked accepted'); render(); } },
    'decline': function (b) { if (attempt(function () { core.setQuoteStatus(b.dataset.id, 'declined'); })) { toast('Quote marked declined'); render(); } },
    'void': function (b) { var d = docFrom(b); confirmDialog('Void ' + d.number + '?', '<p>The invoice keeps its number, shows a VOID stamp and is excluded from all totals. This can’t be undone.</p>', 'Void invoice', true).then(function (y) { if (y && attempt(function () { core.voidInvoice(d.id); })) { toast('Invoice voided'); render(); } }); },
    'duplicate': function (b) { var d = core.duplicate(b.dataset.id); toast('Duplicated as a new draft'); openEditor(d.id); },
    'pdf': function (b) { openPdfTip(docFrom(b)); },
    'del-payment': function (b) { confirmDialog('Delete this payment?', '<p>The balance is recalculated.</p>', 'Delete payment', true).then(function (y) { if (y) { core.deletePayment(b.dataset.id); toast('Payment deleted'); render(); } }); },
    'client': function (b) { openClient(b.dataset.id); }, 'client-new': function () { openClientForm(null); },
    'item': function (b) { openItem(core.item(b.dataset.id)); }, 'item-new': function () { openItem(null); },
    'rep-preset': function (b) { view.repPreset = b.dataset.id; if (b.dataset.id !== 'custom') { var r = core.presetRange(b.dataset.id); view.repFrom = r.from; view.repTo = r.to; } render(); },
    'csv-docs': function () { download('documents-' + core.today() + '.csv', core.docsCsv(core.state.docs.filter(function (d) { return d.date >= view.repFrom && d.date <= view.repTo; })), 'text/csv'); toast('Documents CSV exported'); },
    'csv-payments': function () { download('payments-' + core.today() + '.csv', core.paymentsCsv(), 'text/csv'); toast('Payments CSV exported'); },
    'csv-tax': function () { download('tax-report-' + view.repFrom + '-to-' + view.repTo + '.csv', core.taxCsv(core.report(view.repFrom, view.repTo), view.repFrom, view.repTo), 'text/csv'); toast('Tax CSV exported'); },
    'rate-new': function () { openRate(null); }, 'rate-edit': function (b) { openRate(core.taxRate(b.dataset.id)); },
    'rate-del': function (b) { if (attempt(function () { core.deleteTaxRate(b.dataset.id); })) { toast('Tax rate deleted'); render(); } },
    'set-next': function (b) { var k = b.dataset.id, y = core.parts(core.today()).y; if (attempt(function () { core.setNextNumber(k, y, parseInt($('#next-' + k).value, 10)); })) { toast('Next number saved'); render(); } },
    'logo-upload': function () { $('#logoFile').click(); }, 'logo-remove': function () { core.updateSettings({ logo: '' }); toast('Logo removed'); render(); },
    'export': function () { download('invoices-backup-' + core.today() + '.json', core.exportState(), 'application/json'); toast('Backup exported'); },
    'import': function () { $('#importFile').click(); },
    'sample': function () { confirmDialog('Load sample data?', '<p>This replaces all current data with the sample studio and 12 months of history. Export a backup first if you want to keep your data.</p>', 'Load sample data', true).then(function (y) { if (y) { core.loadSample(); view.selected = null; toast('Sample data loaded'); go('today'); } }); },
    'clear-all': function () { confirmDialog('Clear all data?', '<p>Clients, items, documents, payments and schedules are deleted. Your business profile, tax rates and settings are kept.</p>', 'Clear all data', true).then(function (y) { if (y) { core.clearAll(); view.selected = null; toast('All data cleared'); render(); } }); },
    'more': function () {
      openDialog({ title: 'More', small: true, foot: false, body: '<ul class="sheet-menu"><li><button type="button" data-go="items">Items</button></li><li><button type="button" data-go="settings">Settings</button></li><li><button type="button" data-theme>' + (isDark() ? I.sun + 'Light mode' : I.moon + 'Dark mode') + '</button></li></ul>',
        onMount: function (dlg) { dlg.el.addEventListener('click', function (e) { var g = e.target.closest('[data-go]'); if (g) { dlg.close(); go(g.dataset.go); } if (e.target.closest('[data-theme]')) { core.updateSettings({ theme: isDark() ? 'light' : 'dark' }); dlg.close(); render(); } }); } });
    }
  };
  document.addEventListener('click', function (e) {
    var rail = e.target.closest('.rail-btn[data-tab]'); if (rail) return go(rail.dataset.tab);
    if (e.target.closest('.overlay')) return;
    var la = e.target.closest('[data-line-act]');
    if (la) { var d = currentDraft(), i = lineIndex(la), lines = d.lines.slice(), a = la.dataset.lineAct; if (a === 'remove') lines.splice(i, 1); else { var j = a === 'up' ? i - 1 : i + 1; var tmp = lines[i]; lines[i] = lines[j]; lines[j] = tmp; } patchDraft({ lines: lines }, true); return; }
    var b = e.target.closest('[data-action]'); if (!b || b.disabled) return;
    var fn = actions[b.dataset.action]; if (fn) fn(b);
  });
  $('#importFile').addEventListener('change', function (e) {
    var f = e.target.files && e.target.files[0]; e.target.value = ''; if (!f) return;
    var r = new FileReader();
    r.onload = function () {
      var parsed; try { parsed = JSON.parse(r.result); } catch (err) { return toast('Import failed: the file is not valid JSON.', true); }
      var problem = core.validate(parsed); if (problem) return toast('Import failed: ' + problem, true);
      confirmDialog('Import backup?', '<p>Replace all current data with “' + esc(f.name) + '” (' + parsed.docs.length + ' documents, ' + parsed.clients.length + ' clients)?</p>', 'Import backup').then(function (y) { if (y && attempt(function () { core.importState(r.result); })) { core.processSchedules(core.today()); view.selected = null; toast('Backup imported'); render(); } });
    };
    r.onerror = function () { toast('Import failed: the file could not be read.', true); };
    r.readAsText(f);
  });

  /* ============ DAY CHANGE & START-UP ============ */
  function onWake() { var d = core.today(); if (d !== lastDay) { lastDay = d; if (core.processSchedules(d).length) toast('New drafts were created by your recurring schedules'); render(); } }
  window.addEventListener('focus', onWake);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) onWake(); });
  N.app = { view: view, isDark: isDark, render: render, toast: toast };
  core.load();
  core.onSave(function () { $('#saveWarn').hidden = !core.saveError(); });
  if (window.matchMedia) { var mq = window.matchMedia('(prefers-color-scheme: dark)'), onMq = function () { if (core.state.settings.theme === 'system') render(); }; if (mq.addEventListener) mq.addEventListener('change', onMq); }
  render();
  if (/[?&]selftest\b/.test(location.search)) { var res = core.runSelfTests(); toast('Self-tests: ' + res.passed + '/' + res.total + ' passed', res.failed.length > 0); }
})();

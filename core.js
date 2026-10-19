/* core.js — state, storage, dates, money and every invoicing rule. No DOM access. */
(function () {
  'use strict';
  var N = window.INVOICES = window.INVOICES || {};

  /* ============ CONSTANTS ============ */
  var STORAGE_KEY = 'invoices_v1', VERSION = 1;
  var CURRENCIES = {
    USD: { locale: 'en-US', label: 'US Dollar' }, EUR: { locale: 'de-DE', label: 'Euro' }, GBP: { locale: 'en-GB', label: 'British Pound' },
    IDR: { locale: 'id-ID', label: 'Indonesian Rupiah' }, JPY: { locale: 'ja-JP', label: 'Japanese Yen' }, INR: { locale: 'en-IN', label: 'Indian Rupee' },
    AUD: { locale: 'en-AU', label: 'Australian Dollar' }, CAD: { locale: 'en-CA', label: 'Canadian Dollar' }, SGD: { locale: 'en-SG', label: 'Singapore Dollar' },
    MYR: { locale: 'ms-MY', label: 'Malaysian Ringgit' }, CHF: { locale: 'de-CH', label: 'Swiss Franc' }, NZD: { locale: 'en-NZ', label: 'New Zealand Dollar' }
  };
  var ZERO_DECIMAL = ['IDR', 'JPY', 'KRW', 'VND'];
  var TERMS = { receipt: { label: 'Due on receipt', days: 0 }, net7: { label: 'Net 7', days: 7 }, net14: { label: 'Net 14', days: 14 }, net30: { label: 'Net 30', days: 30 }, net60: { label: 'Net 60', days: 60 }, custom: { label: 'Custom date', days: null } };
  var NO_TAX = '__none';
  var KIND_LABEL = { invoice: 'Invoice', quote: 'Quote', credit: 'Credit note' };

  /* ============ STATE ============ */
  var state = null, persist = true, listeners = [], lastSaveError = null;
  var clock = function () { return new Date(); };
  function uid(p) { return (p || 'id') + Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 7); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function ok(n) { return typeof n === 'number' && isFinite(n); }
  function fail(msg) { throw new Error(msg); }
  function byId(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
  function doc(id) { return byId(state.docs, id); }
  function client(id) { return byId(state.clients, id); }
  function item(id) { return byId(state.items, id); }
  function schedule(id) { return byId(state.schedules, id); }
  function taxRate(id) { if (id === NO_TAX || !id) return { id: NO_TAX, name: 'No tax', rate: 0 }; return byId(state.settings.taxRates, id); }

  /* ============ STORAGE ============ */
  function save() {
    if (!persist) return true;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); lastSaveError = null; } catch (e) { lastSaveError = e; }
    listeners.forEach(function (fn) { fn(); });
    return !lastSaveError;
  }
  function load() {
    var loaded = null;
    try { var raw = localStorage.getItem(STORAGE_KEY); if (raw) { var p = JSON.parse(raw); if (!validate(p)) loaded = p; } } catch (e) { loaded = null; }
    state = loaded || N.data.buildSample(api, today());
    processSchedules(today());
    save();
  }

  /* ============ DATES ============ */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function fmtDate(y, m, d) { return y + '-' + pad(m) + '-' + pad(d); }
  function today() { var d = clock(); return fmtDate(d.getFullYear(), d.getMonth() + 1, d.getDate()); }
  function parts(s) { return { y: +s.slice(0, 4), m: +s.slice(5, 7), d: +s.slice(8, 10) }; }
  function dim(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
  function isDate(s) { if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false; var p = parts(s); return p.m >= 1 && p.m <= 12 && p.d >= 1 && p.d <= dim(p.y, p.m); }
  function addDays(s, n) { var p = parts(s), t = new Date(Date.UTC(p.y, p.m - 1, p.d + n)); return fmtDate(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()); }
  function diffDays(a, b) { var pa = parts(a), pb = parts(b); return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 864e5); }
  function addMonths(y, m, k) { var t = y * 12 + (m - 1) + k; return { y: Math.floor(t / 12), m: t % 12 + 1 }; }
  function monthStart(s) { return s.slice(0, 8) + '01'; }
  function monthEnd(s) { var p = parts(s); return fmtDate(p.y, p.m, dim(p.y, p.m)); }
  function shiftMonth(s, k) { var p = parts(s), q = addMonths(p.y, p.m, k); return fmtDate(q.y, q.m, Math.min(p.d, dim(q.y, q.m))); }
  function shiftEnd(to, k) { return to === monthEnd(to) ? monthEnd(shiftMonth(monthStart(to), k)) : shiftMonth(to, k); }

  /* ============ MONEY (per document currency) ============ */
  function digits(cur) { return ZERO_DECIMAL.indexOf(cur) > -1 ? 0 : 2; }
  function scale(cur) { return Math.pow(10, digits(cur)); }
  function round(x) { return Math.floor(x + 0.5 + 1e-9 * Math.max(1, Math.abs(x))); }
  function toMinor(v, cur) { if (!ok(v)) return 0; var x = v * scale(cur); return x >= 0 ? round(x) : -round(-x); }
  function fromMinor(n, cur) { return n / scale(cur); }
  var fmtCache = {};
  function money(v, cur, signed) {
    if (!ok(v)) return '—';
    var c = CURRENCIES[cur] || CURRENCIES.USD, k = cur;
    if (!fmtCache[k]) fmtCache[k] = new Intl.NumberFormat(c.locale, { style: 'currency', currency: cur, minimumFractionDigits: digits(cur), maximumFractionDigits: digits(cur) });
    var s = fmtCache[k].format(Math.abs(v));
    return v < 0 ? '−' + s : (signed && v > 0 ? '+' + s : s);
  }
  function moneyMinor(n, cur, signed) { return money(fromMinor(n, cur), cur, signed); }

  /* ============ DOCUMENT CALCULATION ============ */
  function lineMinor(l, cur) {
    var q = ok(l.qty) ? l.qty : 0, p = ok(l.price) ? l.price : 0;
    var x = q * p * scale(cur);
    return x >= 0 ? round(x) : -round(-x);
  }
  function totals(d) {
    var cur = d.currency, sub = 0, groups = [], gi = {};
    d.lines.forEach(function (l) {
      var amt = lineMinor(l, cur); sub += amt;
      var rid = l.taxRateId || NO_TAX, r = (d.snapshot && d.snapshot.rates && d.snapshot.rates[rid]) || taxRate(rid) || { id: rid, name: '?', rate: 0 };
      if (!(rid in gi)) { gi[rid] = groups.length; groups.push({ rateId: rid, name: r.name, rate: r.rate, net: 0, disc: 0, base: 0, tax: 0 }); }
      groups[gi[rid]].net += amt;
    });
    var disc = 0;
    if (d.discount && ok(d.discount.value) && d.discount.value > 0 && sub > 0) {
      disc = d.discount.type === 'percent' ? round(sub * Math.min(100, d.discount.value) / 100) : toMinor(d.discount.value, cur);
      disc = Math.min(disc, sub);
    }
    if (disc && groups.length) {
      var largest = 0;
      groups.forEach(function (g, i) { if (g.net > groups[largest].net) largest = i; });
      var allocated = 0;
      groups.forEach(function (g, i) { if (i !== largest) { g.disc = round(disc * g.net / sub); allocated += g.disc; } });
      groups[largest].disc = disc - allocated;
    }
    var tax = 0;
    groups.forEach(function (g) {
      var after = g.net - g.disc;
      if (d.taxMode === 'inclusive') { g.tax = round(after * g.rate / (100 + g.rate)); g.base = after - g.tax; }
      else { g.tax = round(after * g.rate / 100); g.base = after; }
      tax += g.tax;
    });
    var total = d.taxMode === 'inclusive' ? sub - disc : sub - disc + tax;
    return { currency: cur, lines: d.lines.map(function (l) { return lineMinor(l, cur); }), subtotal: sub, discount: disc, groups: groups, tax: tax, total: total, beforeTax: total - tax };
  }

  /* ============ BALANCES & STATUS ============ */
  function paymentsOf(invoiceId) { return state.payments.filter(function (p) { return p.invoiceId === invoiceId; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; }); }
  function creditsOf(invoiceId, issuedOnly) { return state.docs.filter(function (d) { return d.kind === 'credit' && d.links.creditOf === invoiceId && (!issuedOnly || d.status === 'issued'); }); }
  function balanceInfo(inv) {
    var cur = inv.currency, total = totals(inv).total, paid = 0, refunded = 0, credited = 0;
    paymentsOf(inv.id).forEach(function (p) { if (p.kind === 'refund') refunded += toMinor(p.amount, cur); else paid += toMinor(p.amount, cur); });
    creditsOf(inv.id, true).forEach(function (c) { credited += totals(c).total; });
    return { total: total, paid: paid, refunded: refunded, credited: credited, balance: total - paid + refunded - credited };
  }
  function status(d, day) {
    day = day || today();
    if (d.kind === 'quote') {
      if (d.status === 'sent' && d.validUntil && d.validUntil < day) return 'expired';
      return d.status;
    }
    if (d.kind === 'credit') return d.status;
    if (d.status === 'draft' || d.status === 'void') return d.status;
    var b = balanceInfo(d);
    if (b.balance < 0) return 'refund-due';
    if (b.balance === 0) return 'paid';
    if (d.due && d.due < day) return 'overdue';
    return (b.paid || b.credited) ? 'partial' : 'sent';
  }

  /* ============ NUMBERING ============ */
  function counterKey(kind, year) { return kind + '-' + year; }
  function lastUsed(kind, year) { return state.counters[counterKey(kind, year)] || 0; }
  function highestUsed(kind, year) {
    var pre = (state.settings.prefixes[kind] || '') + '-' + year + '-', max = 0;
    state.docs.forEach(function (d) { if (d.kind === kind && d.number && d.number.indexOf(pre) === 0) max = Math.max(max, +d.number.slice(pre.length)); });
    return max;
  }
  function setNextNumber(kind, year, next) {
    if (!ok(next) || next < 1 || Math.floor(next) !== next) fail('Enter a whole number of 1 or more.');
    var used = Math.max(highestUsed(kind, year), lastUsed(kind, year));
    if (next <= used) fail('The next number must be higher than ' + used + ', the last one used in ' + year + '.');
    state.counters[counterKey(kind, year)] = next - 1; save();
  }
  function nextNumberPreview(kind, year) { return Math.max(lastUsed(kind, year), highestUsed(kind, year)) + 1; }
  function formatNumber(kind, year, n) { var s = String(n); while (s.length < 4) s = '0' + s; return state.settings.prefixes[kind] + '-' + year + '-' + s; }

  /* ============ DOCUMENTS ============ */
  function dueFrom(date, terms, custom) { var t = TERMS[terms]; return t && t.days !== null ? addDays(date, t.days) : (custom || date); }
  function newDraft(kind, opts) {
    opts = opts || {};
    var s = state.settings, c = opts.clientId ? client(opts.clientId) : null, date = opts.date || today();
    var d = { id: uid('d'), kind: kind, status: 'draft', number: '', clientId: c ? c.id : '', currency: c ? c.currency : s.currency, taxMode: 'exclusive',
      date: date, terms: c ? c.terms : s.terms, due: '', validUntil: '', lines: [], discount: { type: 'percent', value: 0 },
      notes: s.profile.notes || '', footer: s.profile.footer || '', links: {}, snapshot: null, reminders: [], createdAt: clock().toISOString(), issuedAt: null };
    if (kind === 'invoice') d.due = dueFrom(date, d.terms);
    if (kind === 'quote') d.validUntil = addDays(date, s.quoteValidity || 30);
    Object.keys(opts).forEach(function (k) { if (k !== 'clientId' && k !== 'date') d[k] = opts[k]; });
    state.docs.push(d); save();
    return d;
  }
  function requireDraft(d) { if (!d) fail('Document not found.'); if (d.status !== 'draft') fail('Issued documents cannot be edited.'); }
  function updateDraft(id, patch) {
    var d = doc(id); requireDraft(d);
    Object.keys(patch).forEach(function (k) { d[k] = patch[k]; });
    if (patch.clientId !== undefined && patch.applyClientDefaults) { var c = client(patch.clientId); if (c) { d.currency = c.currency; d.terms = c.terms; } delete d.applyClientDefaults; }
    delete d.applyClientDefaults;
    if (d.kind === 'invoice' && d.terms !== 'custom') d.due = dueFrom(d.date, d.terms);
    save(); return d;
  }
  function validateForIssue(d) {
    if (!client(d.clientId)) fail('Choose a client.');
    if (!CURRENCIES[d.currency]) fail('Choose a currency.');
    if (!isDate(d.date)) fail('Enter a valid date.');
    if (!d.lines.length) fail('Add at least one line.');
    d.lines.forEach(function (l, i) {
      if (!(l.description || '').trim()) fail('Line ' + (i + 1) + ': add a description.');
      if (!ok(l.qty) || l.qty <= 0) fail('Line ' + (i + 1) + ': quantity must be above 0.');
      if (!ok(l.price) || l.price < 0) fail('Line ' + (i + 1) + ': price cannot be negative.');
      if (l.taxRateId !== NO_TAX && !taxRate(l.taxRateId)) fail('Line ' + (i + 1) + ': choose a tax rate.');
    });
    if (d.kind === 'invoice' && (!isDate(d.due) || d.due < d.date)) fail('The due date must be on or after the invoice date.');
    if (d.kind === 'quote' && (!isDate(d.validUntil) || d.validUntil < d.date)) fail('The valid-until date must be on or after the quote date.');
    if (totals(d).total <= 0 && d.kind !== 'quote') fail('The total must be above 0.');
    if (d.kind === 'credit') {
      var inv = doc(d.links.creditOf); if (!inv || inv.status !== 'issued') fail('A credit note needs an issued, non-void invoice.');
      if (d.currency !== inv.currency) fail('A credit note must use the invoice currency.');
      var other = creditsOf(inv.id, true).filter(function (c) { return c.id !== d.id; }).reduce(function (s, c) { return s + totals(c).total; }, 0);
      var max = totals(inv).total - other;
      if (totals(d).total > max) fail('This credit note exceeds what can still be credited (' + moneyMinor(max, inv.currency) + ').');
    }
  }
  function snapshotOf(d) {
    var p = state.settings.profile, c = client(d.clientId), rates = {};
    d.lines.forEach(function (l) { var r = taxRate(l.taxRateId); rates[r.id] = { id: r.id, name: r.name, rate: r.rate }; });
    return { business: { name: p.name, address: p.address, email: p.email, phone: p.phone, taxId: p.taxId, payment: p.payment },
      client: { name: c.name, contact: c.contact, email: c.email, address: c.address, taxId: c.taxId }, rates: rates };
  }
  function issue(id) {
    var d = doc(id); requireDraft(d);
    d.lines.forEach(function (l) { if (!l.taxRateId) l.taxRateId = NO_TAX; });
    validateForIssue(d);
    var year = parts(d.date).y, n = nextNumberPreview(d.kind, year);
    d.number = formatNumber(d.kind, year, n);
    state.counters[counterKey(d.kind, year)] = n;
    d.snapshot = snapshotOf(d);
    d.status = d.kind === 'quote' ? 'sent' : 'issued';
    d.issuedAt = clock().toISOString();
    save(); return d;
  }
  function deleteDraft(id) {
    var d = doc(id); if (!d) return;
    if (d.status !== 'draft') fail('Issued documents cannot be deleted. Void the invoice or issue a credit note instead.');
    state.docs = state.docs.filter(function (x) { return x.id !== id; });
    state.docs.forEach(function (x) { if (x.links.invoiceId === id) delete x.links.invoiceId; });
    save();
  }
  function voidInvoice(id) {
    var d = doc(id); if (!d || d.kind !== 'invoice') fail('Only invoices can be voided.');
    if (d.status !== 'issued') fail('Only issued invoices can be voided.');
    if (paymentsOf(id).length) fail('This invoice has payments. Issue a credit note instead.');
    if (creditsOf(id, true).length) fail('This invoice has credit notes, so it cannot be voided.');
    d.status = 'void'; save(); return d;
  }
  function setQuoteStatus(id, s) {
    var d = doc(id); if (!d || d.kind !== 'quote') fail('Quote not found.');
    if (d.status === 'draft') fail('Issue the quote first.');
    if (d.links.invoiceId) fail('This quote was already converted to an invoice.');
    d.status = s; save(); return d;
  }
  function convertQuote(id) {
    var q = doc(id); if (!q || q.kind !== 'quote') fail('Quote not found.');
    if (q.status === 'draft') fail('Issue the quote before converting it.');
    if (q.links.invoiceId && doc(q.links.invoiceId)) fail('This quote was already converted.');
    if (q.status === 'declined') fail('A declined quote cannot be converted.');
    var inv = newDraft('invoice', { clientId: q.clientId });
    inv.currency = q.currency; inv.taxMode = q.taxMode; inv.lines = clone(q.lines).map(function (l) { l.id = uid('l'); return l; });
    inv.discount = clone(q.discount); inv.notes = q.notes; inv.footer = q.footer; inv.links.quoteId = q.id;
    q.links.invoiceId = inv.id; q.status = 'accepted';
    save(); return inv;
  }
  function duplicate(id) {
    var s = doc(id); if (!s) fail('Document not found.');
    var kind = s.kind === 'credit' ? 'invoice' : s.kind;
    var d = newDraft(kind, { clientId: s.clientId });
    d.currency = s.currency; d.taxMode = s.taxMode; d.lines = clone(s.lines).map(function (l) { l.id = uid('l'); return l; });
    d.discount = clone(s.discount); d.notes = s.notes; d.footer = s.footer;
    save(); return d;
  }
  function createCredit(invoiceId) {
    var inv = doc(invoiceId); if (!inv || inv.kind !== 'invoice' || inv.status !== 'issued') fail('Credit notes can only be created from an issued invoice.');
    var c = newDraft('credit', { clientId: inv.clientId });
    c.currency = inv.currency; c.taxMode = inv.taxMode; c.terms = inv.terms; c.lines = clone(inv.lines).map(function (l) { l.id = uid('l'); return l; });
    c.discount = { type: 'percent', value: 0 }; c.notes = 'Credit for ' + inv.number; c.links.creditOf = inv.id;
    save(); return c;
  }

  /* ============ PAYMENTS ============ */
  function recordPayment(invoiceId, p, kind) {
    kind = kind || 'payment';
    var inv = doc(invoiceId); if (!inv || inv.kind !== 'invoice' || inv.status !== 'issued') fail('Payments can only be recorded on issued invoices.');
    var cur = inv.currency, amt = toMinor(p.amount, cur), bal = balanceInfo(inv).balance;
    if (!ok(p.amount) || amt <= 0) fail('Enter an amount above 0.');
    if (!isDate(p.date)) fail('Enter a valid date.');
    if (p.date < inv.date) fail('The date cannot be before the invoice date.');
    if (kind === 'payment' && amt > bal) fail('The payment cannot exceed the balance of ' + moneyMinor(Math.max(0, bal), cur) + '.');
    if (kind === 'refund' && amt > -bal) fail('The refund cannot exceed the ' + moneyMinor(Math.max(0, -bal), cur) + ' owed to the client.');
    var rec = { id: uid('p'), invoiceId: invoiceId, kind: kind, date: p.date, amount: fromMinor(amt, cur), method: (p.method || '').trim(), note: (p.note || '').trim() };
    state.payments.push(rec); save(); return rec;
  }
  function deletePayment(id) { state.payments = state.payments.filter(function (p) { return p.id !== id; }); save(); }

  /* ============ RECURRING ============ */
  function occurrences(s, upTo) {
    var out = [], end = s.end && s.end < upTo ? s.end : upTo, p = parts(s.start);
    for (var k = 0; k < 2000; k++) {
      var d;
      if (s.freq === 'weekly') d = addDays(s.start, 7 * k);
      else if (s.freq === 'monthly') { var q = addMonths(p.y, p.m, k); d = fmtDate(q.y, q.m, Math.min(p.d, dim(q.y, q.m))); }
      else d = fmtDate(p.y + k, p.m, Math.min(p.d, dim(p.y + k, p.m)));
      if (d > end) break; out.push(d);
    }
    return out;
  }
  function nextOccurrence(s, after) { var l = occurrences(s, addDays(after, 400)); for (var i = 0; i < l.length; i++) if (l[i] > after && s.handled.indexOf(l[i]) === -1) return l[i]; return null; }
  function createSchedule(sourceId, o) {
    var src = doc(sourceId); if (!src || src.kind !== 'invoice') fail('Choose an invoice to repeat.');
    if (['weekly', 'monthly', 'yearly'].indexOf(o.freq) === -1) fail('Choose how often.');
    if (!isDate(o.start)) fail('Enter a valid start date.');
    if (o.end && (!isDate(o.end) || o.end < o.start)) fail('The end date must be after the start date.');
    var s = { id: uid('s'), sourceId: sourceId, template: { clientId: src.clientId, currency: src.currency, taxMode: src.taxMode, terms: src.terms === 'custom' ? 'net14' : src.terms, lines: clone(src.lines), discount: clone(src.discount), notes: src.notes, footer: src.footer },
      freq: o.freq, start: o.start, end: o.end || null, mode: o.mode === 'issue' ? 'issue' : 'draft', paused: false, handled: [] };
    state.schedules.push(s); save(); return s;
  }
  function updateSchedule(id, o) {
    var s = schedule(id); if (!s) fail('Schedule not found.');
    if (o.end && (!isDate(o.end) || o.end < s.start)) fail('The end date must be after the start date.');
    if (o.end !== undefined) s.end = o.end || null; if (o.mode) s.mode = o.mode === 'issue' ? 'issue' : 'draft'; if (o.paused !== undefined) s.paused = !!o.paused;
    save(); return s;
  }
  function deleteSchedule(id) { state.schedules = state.schedules.filter(function (s) { return s.id !== id; }); save(); }
  function processSchedules(day) {
    var created = [];
    state.schedules.forEach(function (s) {
      if (s.paused) return;
      occurrences(s, day).forEach(function (occ) {
        if (s.handled.indexOf(occ) > -1) return;
        var t = s.template, d = newDraft('invoice', { clientId: t.clientId, date: occ });
        d.currency = t.currency; d.taxMode = t.taxMode; d.terms = t.terms; d.due = dueFrom(occ, t.terms);
        d.lines = clone(t.lines).map(function (l) { l.id = uid('l'); return l; }); d.discount = clone(t.discount); d.notes = t.notes; d.footer = t.footer;
        d.links.scheduleId = s.id; s.handled.push(occ);
        if (s.mode === 'issue') { try { issue(d.id); } catch (e) { /* stays a draft if invalid */ } }
        created.push(d);
      });
    });
    if (created.length) save();
    return created;
  }

  /* ============ REMINDERS ============ */
  function niceDate(s) { var p = parts(s); return new Date(p.y, p.m - 1, p.d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  function suggestedTone(inv, day) { var late = inv.due ? diffDays(inv.due, day) : 0; return late > 30 ? 'final' : late > 0 ? 'firm' : 'friendly'; }
  function reminderText(inv, tone, day) {
    var snap = inv.snapshot || snapshotOf(inv), b = balanceInfo(inv), amount = moneyMinor(b.balance, inv.currency), late = Math.max(0, diffDays(inv.due, day));
    var due = niceDate(inv.due), name = (snap.client.contact || snap.client.name).split(' ')[0], biz = snap.business.name, pay = snap.business.payment ? '\n\nPayment details:\n' + snap.business.payment : '';
    var subject, body;
    if (tone === 'friendly') {
      subject = 'Invoice ' + inv.number + ', due ' + due;
      body = 'Hi ' + name + ',\n\nA quick reminder that invoice ' + inv.number + ' for ' + amount + ' is due on ' + due + '. The PDF is attached for your records.' + pay + '\n\nThank you,\n' + biz;
    } else if (tone === 'firm') {
      subject = 'Overdue: invoice ' + inv.number + ' (' + amount + ')';
      body = 'Hi ' + name + ',\n\nInvoice ' + inv.number + ' for ' + amount + ' was due on ' + due + ' and is now ' + late + ' day' + (late === 1 ? '' : 's') + ' overdue. Could you let me know when payment will be made? The PDF is attached.' + pay + '\n\nThanks,\n' + biz;
    } else {
      subject = 'Final reminder: invoice ' + inv.number + ' is ' + late + ' days overdue';
      body = 'Hi ' + name + ',\n\nInvoice ' + inv.number + ' for ' + amount + ' is now ' + late + ' days past its due date of ' + due + '. Please arrange payment within 7 days, or reply to agree on a payment plan. The PDF is attached again.' + pay + '\n\nRegards,\n' + biz;
    }
    return { subject: subject, body: body };
  }
  function recordReminder(id, tone, day) { var d = doc(id); if (d) { d.reminders.push({ date: day || today(), tone: tone }); save(); } }

  /* ============ CLIENTS, ITEMS, SETTINGS ============ */
  function clientUsedByIssued(id) { return state.docs.some(function (d) { return d.clientId === id && d.status !== 'draft'; }); }
  function saveClient(c) {
    var name = (c.name || '').trim(); if (!name) fail('Enter the client name.');
    if (!CURRENCIES[c.currency]) fail('Choose a currency.');
    if (!TERMS[c.terms] || c.terms === 'custom') fail('Choose default payment terms.');
    if (c.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email.trim())) fail('Enter a valid email or leave it empty.');
    var ex = c.id ? client(c.id) : null, fields = { name: name, contact: (c.contact || '').trim(), email: (c.email || '').trim(), address: (c.address || '').trim(), taxId: (c.taxId || '').trim(), currency: c.currency, terms: c.terms };
    if (ex) Object.keys(fields).forEach(function (k) { ex[k] = fields[k]; }); else { ex = fields; ex.id = uid('c'); ex.archived = false; state.clients.push(ex); }
    save(); return ex;
  }
  function setClientArchived(id, v) { var c = client(id); if (c) { c.archived = !!v; save(); } }
  function deleteClient(id) {
    if (clientUsedByIssued(id)) fail('This client has issued documents. Archive the client instead.');
    if (state.docs.some(function (d) { return d.clientId === id; })) fail('Delete this client’s drafts first, or archive the client.');
    state.clients = state.clients.filter(function (c) { return c.id !== id; }); save();
  }
  function saveItem(it) {
    var name = (it.name || '').trim(); if (!name) fail('Enter the item name.');
    if (!ok(it.price) || it.price < 0) fail('Enter a price of 0 or more.');
    if (it.taxRateId !== NO_TAX && !taxRate(it.taxRateId)) fail('Choose a tax rate.');
    var ex = it.id ? item(it.id) : null, fields = { name: name, description: (it.description || '').trim(), price: Math.round(it.price * 10000) / 10000, taxRateId: it.taxRateId };
    if (ex) Object.keys(fields).forEach(function (k) { ex[k] = fields[k]; }); else { ex = fields; ex.id = uid('i'); ex.archived = false; state.items.push(ex); }
    save(); return ex;
  }
  function setItemArchived(id, v) { var i = item(id); if (i) { i.archived = !!v; save(); } }
  function deleteItem(id) { state.items = state.items.filter(function (i) { return i.id !== id; }); save(); }
  function saveTaxRate(r) {
    var name = (r.name || '').trim(); if (!name) fail('Enter the tax name.');
    if (!ok(r.rate) || r.rate < 0 || r.rate > 100) fail('Enter a rate between 0 and 100.');
    var ex = r.id ? taxRate(r.id) : null;
    if (ex && ex.id !== NO_TAX) { ex.name = name; ex.rate = r.rate; } else state.settings.taxRates.push({ id: uid('t'), name: name, rate: r.rate });
    save();
  }
  function taxRateUsed(id) { return state.docs.some(function (d) { return d.lines.some(function (l) { return l.taxRateId === id; }); }) || state.items.some(function (i) { return i.taxRateId === id; }); }
  function deleteTaxRate(id) { if (taxRateUsed(id)) fail('This tax rate is used by documents or items.'); state.settings.taxRates = state.settings.taxRates.filter(function (r) { return r.id !== id; }); save(); }
  function updateSettings(patch) { Object.keys(patch).forEach(function (k) { state.settings[k] = patch[k]; }); save(); }
  function updateProfile(patch) { Object.keys(patch).forEach(function (k) { state.settings.profile[k] = patch[k]; }); save(); }

  /* ============ REPORTS (always per currency) ============ */
  function currenciesInUse() { var s = {}; state.docs.forEach(function (d) { if (d.status !== 'draft') s[d.currency] = 1; }); return Object.keys(s).sort(); }
  function report(from, to, day) {
    day = day || today();
    var out = {};
    function bucket(cur) { if (!out[cur]) out[cur] = { currency: cur, invoiced: 0, collected: 0, outstanding: 0, aging: { 'not-due': 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0 }, clients: {}, tax: {}, quotes: { sent: 0, accepted: 0, declined: 0, expired: 0 } }; return out[cur]; }
    function addTax(b, d, sign) {
      totals(d).groups.forEach(function (g) {
        var k = g.rateId; if (!b.tax[k]) b.tax[k] = { name: g.name, rate: g.rate, base: 0, tax: 0 };
        b.tax[k].base += sign * g.base; b.tax[k].tax += sign * g.tax;
      });
    }
    state.docs.forEach(function (d) {
      if (d.status === 'draft') return;
      var b = bucket(d.currency), inRange = d.date >= from && d.date <= to;
      if (d.kind === 'invoice' && d.status === 'issued') {
        if (inRange) { var t = totals(d).total; b.invoiced += t; b.clients[d.clientId] = (b.clients[d.clientId] || 0) + t; addTax(b, d, 1); }
        var bal = balanceInfo(d).balance;
        if (bal > 0) { b.outstanding += bal; var late = d.due ? diffDays(d.due, day) : 0; b.aging[late <= 0 ? 'not-due' : late <= 30 ? '1-30' : late <= 60 ? '31-60' : late <= 90 ? '61-90' : '90+'] += bal; }
      }
      if (d.kind === 'credit' && d.status === 'issued' && inRange) { var ct = totals(d).total; b.invoiced -= ct; b.clients[d.clientId] = (b.clients[d.clientId] || 0) - ct; addTax(b, d, -1); }
      /* Quotes: "sent" counts every issued quote dated in the period; the others count its current outcome */
      if (d.kind === 'quote' && inRange) { var qs = status(d, day); b.quotes.sent++; if (qs === 'accepted' || qs === 'declined' || qs === 'expired') b.quotes[qs]++; }
    });
    state.payments.forEach(function (p) {
      var inv = doc(p.invoiceId); if (!inv || p.date < from || p.date > to) return;
      var b = bucket(inv.currency), amt = toMinor(p.amount, inv.currency); b.collected += p.kind === 'refund' ? -amt : amt;
    });
    return Object.keys(out).sort().map(function (k) {
      var b = out[k];
      b.topClients = Object.keys(b.clients).map(function (id) { var c = client(id); return { name: c ? c.name : '?', amount: b.clients[id] }; }).sort(function (x, y) { return y.amount - x.amount; }).slice(0, 5);
      b.taxRows = Object.keys(b.tax).map(function (id) { return b.tax[id]; }).sort(function (x, y) { return y.rate - x.rate; });
      var decided = b.quotes.accepted + b.quotes.declined + b.quotes.expired;
      b.acceptance = decided ? b.quotes.accepted / decided * 100 : null;
      return b;
    });
  }
  function presetRange(preset, ref) {
    ref = ref || today(); var p = parts(ref);
    if (preset === 'month') return { from: monthStart(ref), to: ref };
    if (preset === 'last-month') { var lm = shiftMonth(monthStart(ref), -1); return { from: lm, to: monthEnd(lm) }; }
    if (preset === 'quarter') { var qm = Math.floor((p.m - 1) / 3) * 3 + 1; return { from: fmtDate(p.y, qm, 1), to: ref }; }
    if (preset === 'year') return { from: fmtDate(p.y, 1, 1), to: ref };
    if (preset === '12m') return { from: shiftMonth(monthStart(ref), -11), to: ref };
    return null;
  }
  function collectedBetween(from, to) {
    var out = {};
    state.payments.forEach(function (p) { var inv = doc(p.invoiceId); if (!inv || p.date < from || p.date > to) return; var a = toMinor(p.amount, inv.currency); out[inv.currency] = (out[inv.currency] || 0) + (p.kind === 'refund' ? -a : a); });
    return out;
  }

  /* ============ CSV ============ */
  function csvCell(v) {
    if (typeof v === 'number') return isFinite(v) ? String(v) : '';
    var s = v == null ? '' : String(v);
    if (/^[=+\-@]/.test(s)) s = "'" + s;
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function toCsv(rows) { return '\ufeff' + rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n'); }
  function docsCsv(list) {
    var rows = [['Number', 'Kind', 'Status', 'Client', 'Date', 'Due date', 'Currency', 'Subtotal', 'Discount', 'Tax', 'Total', 'Balance']];
    list.forEach(function (d) {
      var t = totals(d), c = client(d.clientId), cur = d.currency, bal = d.kind === 'invoice' && d.status === 'issued' ? fromMinor(balanceInfo(d).balance, cur) : '';
      rows.push([d.number || '(draft)', KIND_LABEL[d.kind], status(d), c ? c.name : '', d.date, d.due || d.validUntil || '', cur, fromMinor(t.subtotal, cur), fromMinor(t.discount, cur), fromMinor(t.tax, cur), fromMinor(t.total, cur), bal]);
    });
    return toCsv(rows);
  }
  function paymentsCsv() {
    var rows = [['Date', 'Kind', 'Invoice', 'Client', 'Currency', 'Amount', 'Method', 'Note']];
    state.payments.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; }).forEach(function (p) {
      var inv = doc(p.invoiceId), c = inv ? client(inv.clientId) : null;
      rows.push([p.date, p.kind, inv ? inv.number : '', c ? c.name : '', inv ? inv.currency : '', p.kind === 'refund' ? -p.amount : p.amount, p.method, p.note]);
    });
    return toCsv(rows);
  }
  function taxCsv(rep, from, to) {
    var rows = [['Period', 'Currency', 'Tax', 'Rate %', 'Taxable base', 'Tax']];
    rep.forEach(function (b) { b.taxRows.forEach(function (t) { rows.push([from + ' to ' + to, b.currency, t.name, t.rate, fromMinor(t.base, b.currency), fromMinor(t.tax, b.currency)]); }); });
    return toCsv(rows);
  }

  /* ============ IMPORT / EXPORT ============ */
  function validate(d) {
    if (!d || typeof d !== 'object') return 'The file is not a valid backup.';
    if (d.version !== VERSION) return 'This backup was made by a different version of the app.';
    if (!d.settings || !d.settings.profile || !Array.isArray(d.settings.taxRates) || !d.settings.prefixes) return 'Settings are missing or invalid.';
    var arrays = ['clients', 'items', 'docs', 'payments', 'schedules'];
    for (var i = 0; i < arrays.length; i++) if (!Array.isArray(d[arrays[i]])) return 'The backup is missing "' + arrays[i] + '".';
    if (!d.counters || typeof d.counters !== 'object') return 'Numbering counters are missing.';
    for (i = 0; i < d.docs.length; i++) { var x = d.docs[i]; if (!x.id || ['invoice', 'quote', 'credit'].indexOf(x.kind) === -1 || !isDate(x.date) || !Array.isArray(x.lines) || !CURRENCIES[x.currency]) return 'Document ' + (i + 1) + ' is invalid.'; }
    for (i = 0; i < d.payments.length; i++) { var p = d.payments[i]; if (!p.id || !isDate(p.date) || !ok(p.amount)) return 'Payment ' + (i + 1) + ' is invalid.'; }
    for (i = 0; i < d.clients.length; i++) if (!d.clients[i].id || typeof d.clients[i].name !== 'string') return 'Client ' + (i + 1) + ' is invalid.';
    return null;
  }
  function exportState() { return JSON.stringify(state); }
  function importState(json) { var d; try { d = JSON.parse(json); } catch (e) { fail('The file is not valid JSON.'); } var p = validate(d); if (p) fail(p); state = d; save(); }
  function loadSample() { state = N.data.buildSample(api, today()); processSchedules(today()); save(); }
  function clearAll() { state = { version: VERSION, settings: state.settings, clients: [], items: [], docs: [], payments: [], schedules: [], counters: {} }; save(); }

  /* ============ SELF-TESTS (golden tests A–F) ============ */
  function runSelfTests() {
    var saved = state, savedPersist = persist, savedClock = clock, results = [];
    function check(name, actual, expected) { var pass = typeof expected === 'number' ? Math.abs(actual - expected) < 1e-9 : actual === expected; results.push({ name: name, pass: pass, actual: actual, expected: expected }); }
    function setToday(s) { var p = parts(s); clock = function () { return new Date(p.y, p.m - 1, p.d, 12); }; }
    function rejects(fn) { try { fn(); return false; } catch (e) { return true; } }
    function base() {
      return { version: VERSION, settings: { profile: { name: 'Test Studio', address: '', email: '', phone: '', taxId: '', payment: 'Bank transfer', notes: '', footer: '' }, logo: '', currency: 'USD',
        taxRates: [{ id: 'vat', name: 'VAT 20%', rate: 20 }, { id: 'zero', name: 'Zero', rate: 0 }], prefixes: { invoice: 'INV', quote: 'Q', credit: 'CN' }, terms: 'net14', quoteValidity: 30, paper: 'A4', theme: 'system' },
        clients: [{ id: 'acme', name: 'Acme Ltd', contact: 'Jo Doe', email: '', address: '', taxId: '', currency: 'USD', terms: 'net14', archived: false }],
        items: [], docs: [], payments: [], schedules: [], counters: {} };
    }
    function L(desc, qty, price, rate) { return { id: uid('l'), description: desc, qty: qty, price: price, taxRateId: rate }; }
    try {
      persist = false; fmtCache = {};
      /* Test A */
      state = base(); setToday('2026-10-01');
      var a = newDraft('invoice', { clientId: 'acme', date: '2026-10-01' });
      updateDraft(a.id, { lines: [L('Website design', 1, 2400, 'vat'), L('Hosting', 12, 15, 'vat'), L('Domain', 1, 18.99, 'zero')], discount: { type: 'percent', value: 10 } });
      var ta = totals(a), gv = ta.groups.filter(function (g) { return g.rateId === 'vat'; })[0], gz = ta.groups.filter(function (g) { return g.rateId === 'zero'; })[0];
      check('A subtotal', fromMinor(ta.subtotal, 'USD'), 2598.99); check('A discount', fromMinor(ta.discount, 'USD'), 259.90);
      check('A share VAT', fromMinor(gv.disc, 'USD'), 258.00); check('A share Zero', fromMinor(gz.disc, 'USD'), 1.90);
      check('A VAT base', fromMinor(gv.base, 'USD'), 2322.00); check('A VAT', fromMinor(gv.tax, 'USD'), 464.40); check('A total', fromMinor(ta.total, 'USD'), 2803.49); check('A due date', a.due, '2026-10-15');
      /* Test B */
      var bst = base(); bst.settings.taxRates = [{ id: 'r21', name: 'VAT 21%', rate: 21 }, { id: 'r9', name: 'VAT 9%', rate: 9 }]; state = bst;
      var b = newDraft('invoice', { clientId: 'acme' }); updateDraft(b.id, { currency: 'EUR', taxMode: 'inclusive', lines: [L('Coffee beans', 3, 12.10, 'r21'), L('Book', 1, 10.90, 'r9')] });
      var tb = totals(b);
      check('B total', fromMinor(tb.total, 'EUR'), 47.20); check('B tax 21%', fromMinor(tb.groups[0].tax, 'EUR'), 6.30); check('B tax 9%', fromMinor(tb.groups[1].tax, 'EUR'), 0.90); check('B before tax', fromMinor(tb.beforeTax, 'EUR'), 40.00);
      /* Test C */
      var cst = base(); cst.settings.taxRates = [{ id: 'ppn', name: 'PPN 11%', rate: 11 }]; state = cst;
      var c = newDraft('invoice', { clientId: 'acme' }); updateDraft(c.id, { currency: 'IDR', taxMode: 'inclusive', lines: [L('Item A', 3, 45500, 'ppn'), L('Item B', 1, 27750, 'ppn')], discount: { type: 'fixed', value: 10000 } });
      var tc = totals(c);
      check('C subtotal', tc.subtotal, 164250); check('C total', tc.total, 154250); check('C tax', tc.tax, 15286); check('C before tax', tc.beforeTax, 138964);
      check('C formatted', money(fromMinor(tc.total, 'IDR'), 'IDR').replace(/\s/g, ''), 'Rp154.250');
      /* Test D */
      state = base(); setToday('2026-10-01');
      var d = newDraft('invoice', { clientId: 'acme', date: '2026-10-01' });
      updateDraft(d.id, { lines: [L('Website design', 1, 2400, 'vat'), L('Hosting', 12, 15, 'vat'), L('Domain', 1, 18.99, 'zero')], discount: { type: 'percent', value: 10 } });
      issue(d.id);
      recordPayment(d.id, { amount: 1000, date: '2026-10-10', method: 'Bank' });
      check('D balance after payment', fromMinor(balanceInfo(d).balance, 'USD'), 1803.49); check('D status partial', status(d, '2026-10-11'), 'partial');
      setToday('2026-10-12');
      var cn1 = createCredit(d.id); updateDraft(cn1.id, { date: '2026-10-12', lines: [L('Hosting', 12, 15, 'vat')] }); issue(cn1.id);
      check('D credit 1 total', fromMinor(totals(cn1).total, 'USD'), 216.00); check('D balance after credit', fromMinor(balanceInfo(d).balance, 'USD'), 1587.49);
      check('D status overdue', status(d, '2026-10-16'), 'overdue');
      recordPayment(d.id, { amount: 1587.49, date: '2026-10-20', method: 'Bank' });
      check('D paid', fromMinor(balanceInfo(d).balance, 'USD'), 0); check('D status paid', status(d, '2026-10-20'), 'paid');
      setToday('2026-10-25');
      var cn2 = createCredit(d.id); updateDraft(cn2.id, { date: '2026-10-25', lines: [L('Hosting refund', 1, 50, 'vat')] }); issue(cn2.id);
      check('D credit 2 total', fromMinor(totals(cn2).total, 'USD'), 60.00); check('D balance refund', fromMinor(balanceInfo(d).balance, 'USD'), -60.00); check('D status refund due', status(d, '2026-10-25'), 'refund-due');
      check('D refund 70 rejected', rejects(function () { recordPayment(d.id, { amount: 70, date: '2026-10-28' }, 'refund'); }), true);
      recordPayment(d.id, { amount: 60, date: '2026-10-28' }, 'refund');
      check('D balance after refund', fromMinor(balanceInfo(d).balance, 'USD'), 0); check('D status paid again', status(d, '2026-10-28'), 'paid');
      var rep = report('2026-10-01', '2026-10-31', '2026-10-31')[0], vatRow = rep.taxRows.filter(function (r) { return r.rate === 20; })[0];
      check('D invoiced', fromMinor(rep.invoiced, 'USD'), 2527.49); check('D collected', fromMinor(rep.collected, 'USD'), 2527.49);
      check('D VAT base', fromMinor(vatRow.base, 'USD'), 2092.00); check('D VAT', fromMinor(vatRow.tax, 'USD'), 418.40);
      var cn3 = createCredit(d.id); updateDraft(cn3.id, { lines: [L('Too much', 1, 2600, 'zero')] });
      check('D credit over limit rejected', rejects(function () { issue(cn3.id); }), true);
      /* Test E (continues D's state) */
      setNextNumber('invoice', 2026, 148);
      var e1 = newDraft('invoice', { clientId: 'acme', date: '2026-12-30' }); updateDraft(e1.id, { lines: [L('Work', 1, 100, 'vat')] }); issue(e1.id);
      check('E 2026 number', e1.number, 'INV-2026-0148');
      var e2 = newDraft('invoice', { clientId: 'acme', date: '2027-01-02' }); updateDraft(e2.id, { lines: [L('Work', 1, 100, 'vat')] }); issue(e2.id);
      check('E 2027 number', e2.number, 'INV-2027-0001');
      check('E next 148 rejected', rejects(function () { setNextNumber('invoice', 2026, 148); }), true);
      check('E delete issued rejected', rejects(function () { deleteDraft(e1.id); }), true);
      voidInvoice(e2.id); check('E void keeps number', e2.status + ' ' + e2.number, 'void INV-2027-0001');
      check('E void with payments rejected', rejects(function () { voidInvoice(d.id); }), true);
      /* Test F */
      state = base(); setToday('2027-01-31');
      var src = newDraft('invoice', { clientId: 'acme', date: '2027-01-31' }); updateDraft(src.id, { lines: [L('Retainer', 1, 1500, 'vat')] });
      var sch = createSchedule(src.id, { freq: 'monthly', start: '2027-01-31', mode: 'draft' });
      setToday('2027-03-15'); processSchedules('2027-03-15');
      var gen = function () { return state.docs.filter(function (x) { return x.links.scheduleId === sch.id; }).sort(function (x, y) { return x.date < y.date ? -1 : 1; }); };
      check('F count', gen().length, 2); check('F dates', gen().map(function (x) { return x.date; }).join(','), '2027-01-31,2027-02-28');
      check('F no numbers', gen().every(function (x) { return !x.number && x.status === 'draft'; }), true);
      check('F due dates', gen().map(function (x) { return x.due; }).join(','), '2027-02-14,2027-03-14');
      processSchedules('2027-03-15'); check('F idempotent', gen().length, 2);
      setToday('2027-03-31'); processSchedules('2027-03-31'); check('F third', gen().length + ' ' + gen()[2].date, '3 2027-03-31');
    } catch (err) {
      results.push({ name: 'Unexpected error: ' + err.message, pass: false, actual: '', expected: '' });
    } finally { state = saved; persist = savedPersist; clock = savedClock; fmtCache = {}; }
    var failed = results.filter(function (r) { return !r.pass; });
    results.forEach(function (r) { console[r.pass ? 'log' : 'error']((r.pass ? 'PASS ' : 'FAIL ') + r.name + (r.pass ? '' : ' — expected ' + r.expected + ', got ' + r.actual)); });
    console.log('Self-tests: ' + (results.length - failed.length) + '/' + results.length + ' passed');
    return { passed: results.length - failed.length, total: results.length, failed: failed };
  }

  /* ============ PUBLIC API ============ */
  var api = N.core = {
    VERSION: VERSION, CURRENCIES: CURRENCIES, TERMS: TERMS, NO_TAX: NO_TAX, KIND_LABEL: KIND_LABEL,
    get state() { return state; }, load: load, save: save, onSave: function (fn) { listeners.push(fn); }, saveError: function () { return lastSaveError; },
    setClock: function (fn) { clock = fn || function () { return new Date(); }; }, uid: uid, clone: clone, ok: ok,
    doc: doc, client: client, item: item, schedule: schedule, taxRate: taxRate,
    today: today, isDate: isDate, addDays: addDays, diffDays: diffDays, parts: parts, fmtDate: fmtDate, monthStart: monthStart, monthEnd: monthEnd, shiftMonth: shiftMonth, shiftEnd: shiftEnd,
    digits: digits, toMinor: toMinor, fromMinor: fromMinor, money: money, moneyMinor: moneyMinor, lineMinor: lineMinor,
    totals: totals, balanceInfo: balanceInfo, status: status, paymentsOf: paymentsOf, creditsOf: creditsOf,
    nextNumberPreview: nextNumberPreview, setNextNumber: setNextNumber, formatNumber: formatNumber, dueFrom: dueFrom,
    newDraft: newDraft, updateDraft: updateDraft, issue: issue, deleteDraft: deleteDraft, voidInvoice: voidInvoice, setQuoteStatus: setQuoteStatus,
    convertQuote: convertQuote, duplicate: duplicate, createCredit: createCredit, recordPayment: recordPayment, deletePayment: deletePayment, snapshotOf: snapshotOf,
    occurrences: occurrences, nextOccurrence: nextOccurrence, createSchedule: createSchedule, updateSchedule: updateSchedule, deleteSchedule: deleteSchedule, processSchedules: processSchedules,
    suggestedTone: suggestedTone, reminderText: reminderText, recordReminder: recordReminder,
    saveClient: saveClient, setClientArchived: setClientArchived, deleteClient: deleteClient, clientUsedByIssued: clientUsedByIssued,
    saveItem: saveItem, setItemArchived: setItemArchived, deleteItem: deleteItem, saveTaxRate: saveTaxRate, deleteTaxRate: deleteTaxRate, taxRateUsed: taxRateUsed,
    updateSettings: updateSettings, updateProfile: updateProfile,
    currenciesInUse: currenciesInUse, report: report, presetRange: presetRange, collectedBetween: collectedBetween,
    docsCsv: docsCsv, paymentsCsv: paymentsCsv, taxCsv: taxCsv,
    validate: validate, exportState: exportState, importState: importState, loadSample: loadSample, clearAll: clearAll, runSelfTests: runSelfTests,
    _withState: function (st, fn) { var prev = state, pp = persist; state = st; persist = false; try { return fn(); } finally { state = prev; persist = pp; } },
    _setClockFor: function (dateStr) { var p = parts(dateStr); clock = function () { return new Date(p.y, p.m - 1, p.d, 10); }; }
  };
})();

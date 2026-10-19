/* data.js — defaults and the deterministic 12-month sample generator for Northline Studio */
(function () {
  'use strict';
  var N = window.INVOICES = window.INVOICES || {};
  var SEED = 20261018;
  var TAX_RATES = 'VAT 20%, Reduced 5%, Zero 0%';

  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function parseRates(s) {
    var ids = ['t_vat', 't_red', 't_zero'];
    return s.split(',').map(function (part, i) { var m = part.trim().match(/^(.*?)(\d+(?:\.\d+)?)\s*%$/); return { id: ids[i] || 't_' + i, name: part.trim(), rate: m ? +m[2] : 0 }; });
  }
  function defaultSettings() {
    return {
      profile: { name: 'Northline Studio', address: '88 Mercer Street, Studio 4\nPortland, OR 97209', email: 'hello@northline.studio', phone: '(503) 555-0187', taxId: 'VAT GB 284 1937 06',
        payment: 'Bank transfer to Northline Studio LLC\nAccount 4421 9083, routing 123000220\nOr pay by card: northline.studio/pay', notes: 'Thank you for working with Northline.', footer: 'Northline Studio LLC, independent brand and web design' },
      logo: '', currency: 'USD', taxRates: parseRates(TAX_RATES), prefixes: { invoice: 'INV', quote: 'Q', credit: 'CN' },
      terms: 'net14', quoteValidity: 30, paper: 'A4', theme: 'system'
    };
  }
  function clients() {
    function c(id, name, contact, email, address, cur, terms) { return { id: id, name: name, contact: contact, email: email, address: address, taxId: '', currency: cur, terms: terms, archived: false }; }
    return [
      c('c_harbor', 'Harbor & Pine Coffee', 'Maya Chen', 'maya@harborpine.co', '412 Alder St\nPortland, OR 97205', 'USD', 'net14'),
      c('c_field', 'Fieldnote Press', 'Daniel Okafor', 'daniel@fieldnotepress.com', '19 Grand Ave\nOakland, CA 94612', 'USD', 'net30'),
      c('c_ridge', 'Ridgeway Outdoors', 'Sam Whitaker', 'sam@ridgeway.com', '700 Summit Rd\nBoulder, CO 80302', 'USD', 'net30'),
      c('c_lumen', 'Lumen Dental Group', 'Dr. Priya Raman', 'priya@lumendental.com', '55 Broadway, Suite 210\nSeattle, WA 98102', 'USD', 'net14'),
      c('c_kaskade', 'Kaskade GmbH', 'Lena Vogel', 'lena.vogel@kaskade.de', 'Torstraße 140\n10119 Berlin, Germany', 'EUR', 'net30'),
      c('c_marta', 'Marta Ferreira', 'Marta Ferreira', 'marta.ferreira@mail.pt', 'Rua das Flores 28\n4050-262 Porto, Portugal', 'EUR', 'receipt'),
      c('c_blackbird', 'Blackbird & Co', 'Oliver Grant', 'oliver@blackbird.co.uk', '3 Neal’s Yard\nLondon WC2H 9DP, UK', 'GBP', 'net14')
    ];
  }
  function items() {
    function i(id, name, desc, price, tax) { return { id: id, name: name, description: desc, price: price, taxRateId: tax, archived: false }; }
    return [
      i('i_brand', 'Brand identity package', 'Logo suite, colour palette, typography and brand guidelines', 4800, 't_vat'),
      i('i_logo', 'Logo design', 'Three concepts, two rounds of revisions, final files', 1800, 't_vat'),
      i('i_page', 'Website page design', 'Responsive design for one page template', 650, 't_vat'),
      i('i_dev', 'Webflow development', 'Build and CMS setup, per hour', 95, 't_vat'),
      i('i_copy', 'Copywriting', 'Website and campaign copy, per hour', 70, 't_vat'),
      i('i_strategy', 'Brand strategy workshop', 'Half-day workshop with summary deck', 1200, 't_vat'),
      i('i_photo', 'Product photography', 'Half-day shoot with 20 edited images', 900, 't_vat'),
      i('i_social', 'Social media kit', 'Templates for posts, stories and covers', 750, 't_vat'),
      i('i_hosting', 'Hosting & maintenance', 'Monthly hosting, updates and backups', 120, 't_vat'),
      i('i_print', 'Printed brand book', '24-page printed brand book, per copy', 48, 't_red'),
      i('i_domain', 'Domain renewal', 'Annual domain renewal', 18.99, 't_zero')
    ];
  }

  function buildSample(core, today) {
    var st = { version: core.VERSION, settings: defaultSettings(), clients: clients(), items: items(), docs: [], payments: [], schedules: [], counters: {} };
    var rng = mulberry32(SEED);
    function r(a, b) { return a + rng() * (b - a); }
    function ri(a, b) { return Math.floor(r(a, b + 1)); }
    function pick(list) { return list[Math.floor(rng() * list.length)]; }
    function line(itemId, qty) { var it = st.items.filter(function (x) { return x.id === itemId; })[0]; return { id: core.uid('l'), description: it.name + ' — ' + it.description, qty: qty, price: it.price, taxRateId: it.taxRateId }; }
    var hourly = { i_dev: [8, 40], i_copy: [4, 16], i_print: [10, 60] };
    function randomLines() {
      var n = rng() < 0.45 ? 1 : rng() < 0.8 ? 2 : 3, used = {}, out = [];
      var pool = ['i_brand', 'i_logo', 'i_page', 'i_dev', 'i_dev', 'i_copy', 'i_strategy', 'i_photo', 'i_social', 'i_print', 'i_domain'];
      while (out.length < n) { var id = pick(pool); if (used[id]) continue; used[id] = 1; var q = hourly[id] ? ri(hourly[id][0], hourly[id][1]) : id === 'i_page' ? ri(2, 6) : 1; out.push(line(id, q)); }
      return out;
    }
    core._withState(st, function () {
      var start = core.shiftMonth(core.monthStart(today), -11), toIssue = [];
      function inPast(d) { return d <= today ? d : today; }
      var weights = ['c_harbor', 'c_field', 'c_field', 'c_ridge', 'c_ridge', 'c_lumen', 'c_kaskade', 'c_kaskade', 'c_marta', 'c_blackbird', 'c_blackbird'];
      /* Recurring retainer (drafts for every month; all but the newest get issued below) */
      core._setClockFor(start);
      var src = core.newDraft('invoice', { clientId: 'c_harbor', date: start });
      core.updateDraft(src.id, { lines: [line('i_hosting', 1)], notes: 'Monthly hosting and maintenance retainer.' });
      var sch = core.createSchedule(src.id, { freq: 'monthly', start: core.addDays(start, 0), mode: 'draft' });
      core.deleteDraft(src.id);
      core.processSchedules(today);
      var retainers = st.docs.filter(function (d) { return d.links.scheduleId === sch.id; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
      retainers.slice(0, -1).forEach(function (d) { toIssue.push(d); });
      /* Quotes (some convert to invoices) */
      var quotes = [];
      for (var k = 0; k < 12; k++) {
        var m0 = core.shiftMonth(start, k), p = core.parts(m0), last = core.monthEnd(m0).slice(8) * 1;
        var nq = k % 3 === 0 ? 2 : 1;
        for (var qn = 0; qn < nq; qn++) {
          var qd = inPast(core.fmtDate(p.y, p.m, ri(1, last))), cl = pick(weights);
          core._setClockFor(qd);
          var q = core.newDraft('quote', { clientId: cl, date: qd });
          core.updateDraft(q.id, { lines: randomLines(), taxMode: cl === 'c_marta' ? 'inclusive' : 'exclusive' });
          quotes.push(q);
        }
      }
      quotes.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
      quotes.forEach(function (q, i) {
        var age = core.diffDays(q.date, today);
        if (i === quotes.length - 1) return; /* newest stays a draft */
        core._setClockFor(q.date); core.issue(q.id);
        if (age < 25) return; /* recent quotes stay sent */
        var roll = rng();
        if (roll < 0.5) { var inv = core.convertQuote(q.id); var idate = core.addDays(q.date, ri(2, 8)); if (idate > today) idate = today; core.updateDraft(inv.id, { date: idate }); toIssue.push(inv); }
        else if (roll < 0.72) core.setQuoteStatus(q.id, 'declined');
        /* otherwise it stays sent and becomes expired */
      });
      /* Regular invoices */
      for (var j = 0; j < 12; j++) {
        var mm = core.shiftMonth(start, j), pp = core.parts(mm), lastDay = core.monthEnd(mm).slice(8) * 1, n = ri(3, 4);
        for (var x = 0; x < n; x++) {
          var dd = inPast(core.fmtDate(pp.y, pp.m, ri(1, lastDay))), cid = pick(weights);
          core._setClockFor(dd);
          var d = core.newDraft('invoice', { clientId: cid, date: dd });
          core.updateDraft(d.id, { lines: randomLines(), taxMode: cid === 'c_marta' ? 'inclusive' : 'exclusive', discount: rng() < 0.12 ? { type: 'percent', value: pick([5, 10]) } : { type: 'percent', value: 0 } });
          toIssue.push(d);
        }
      }
      /* Two quotes still open: sent recently and valid */
      ['c_ridge', 'c_kaskade'].forEach(function (cid, i) {
        var qd2 = core.addDays(today, -(4 + i * 6)); core._setClockFor(qd2);
        var oq = core.newDraft('quote', { clientId: cid, date: qd2 });
        core.updateDraft(oq.id, { lines: i ? [line('i_brand', 1), line('i_strategy', 1)] : [line('i_page', 5), line('i_dev', 30), line('i_photo', 1)] });
        core.issue(oq.id);
      });
      /* One unissued manual draft */
      core._setClockFor(today);
      var draft = core.newDraft('invoice', { clientId: 'c_lumen', date: today });
      core.updateDraft(draft.id, { lines: [line('i_page', 3), line('i_dev', 18)] });
      /* Issue chronologically so numbers follow dates */
      toIssue.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : (a.createdAt < b.createdAt ? -1 : 1); });
      toIssue.forEach(function (d) { core._setClockFor(d.date); core.issue(d.id); });
      /* Payments */
      var issued = toIssue.slice();
      var overdueCandidates = issued.filter(function (d) { var late = core.diffDays(d.due, today); return late > 3 && late < 60; });
      var stayOverdue = overdueCandidates.slice(-2).map(function (d) { return d.id; });
      var partialIds = issued.filter(function (d) { return d.due >= today && stayOverdue.indexOf(d.id) === -1 && d.date < today; }).slice(0, 1).map(function (d) { return d.id; });
      var voidId = issued[2] ? issued[2].id : null;
      issued.forEach(function (d) {
        if (d.id === voidId) { core.voidInvoice(d.id); return; }
        if (stayOverdue.indexOf(d.id) > -1) return;
        var terms = core.diffDays(d.date, d.due), total = core.fromMinor(core.totals(d).total, d.currency);
        if (partialIds.indexOf(d.id) > -1) { var pdp = core.addDays(d.date, 2) > today ? today : core.addDays(d.date, 2); core.recordPayment(d.id, { amount: Math.round(total * 0.4 * 100) / 100, date: pdp, method: 'Bank transfer', note: 'Deposit' }); return; }
        var lateBy = rng() < 0.18 ? ri(3, 20) : -ri(0, Math.max(0, terms - 1)), pd = core.addDays(d.due, lateBy);
        if (pd < d.date) pd = d.date;
        if (pd > today) { if (rng() < 0.35) core.recordPayment(d.id, { amount: total, date: today, method: 'Card' }); return; }
        core.recordPayment(d.id, { amount: total, date: pd, method: rng() < 0.7 ? 'Bank transfer' : 'Card' });
      });
      /* Credit notes: one fully settled with a refund, one left as refund due */
      var paidOnes = issued.filter(function (d) { return core.status(d, today) === 'paid' && d.lines.length > 1 && d.taxMode === 'exclusive'; });
      [paidOnes[Math.floor(paidOnes.length * 0.4)], paidOnes[paidOnes.length - 2]].forEach(function (inv, idx) {
        if (!inv) return;
        var cdate = core.addDays(inv.date, 20); if (cdate > today) cdate = today;
        core._setClockFor(cdate);
        var cn = core.createCredit(inv.id), l = inv.lines[inv.lines.length - 1];
        core.updateDraft(cn.id, { date: cdate, lines: [{ id: core.uid('l'), description: 'Credit: ' + l.description.split(' — ')[0] + ' (scope reduced)', qty: 1, price: Math.round(l.qty * l.price * 0.5 * 100) / 100, taxRateId: l.taxRateId }] });
        core.issue(cn.id);
        if (idx === 0) { var bal = -core.balanceInfo(inv).balance; core.recordPayment(inv.id, { amount: core.fromMinor(bal, inv.currency), date: core.addDays(cdate, 2) > today ? today : core.addDays(cdate, 2), method: 'Bank transfer', note: 'Refund' }, 'refund'); }
      });
      /* Reminder history on the overdue invoices */
      stayOverdue.forEach(function (id) { var d = core.doc(id); d.reminders.push({ date: core.addDays(d.due, 2) > today ? today : core.addDays(d.due, 2), tone: 'firm' }); });
      core._setClockFor(today);
    });
    return st;
  }

  N.data = { SEED: SEED, defaultSettings: defaultSettings, buildSample: buildSample };
})();

/* ui.js — rendering only, including the document paper. Reads INVOICES.core and INVOICES.app.view. */
(function () {
  'use strict';
  var N = window.INVOICES = window.INVOICES || {};
  function C() { return N.core; }
  function V() { return N.app.view; }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  function sel(a, b) { return a === b ? ' selected' : ''; }
  function locFor(cur) { var c = C().CURRENCIES[cur]; return c ? c.locale : 'en-US'; }
  /* Dates follow the interface language, not the document currency */
  function dfmt(s) { if (!s) return '—'; var p = C().parts(s); return new Date(p.y, p.m - 1, p.d).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }); }
  function dshort(s) { var p = C().parts(s); return new Date(p.y, p.m - 1, p.d).toLocaleDateString('en-US', { day: 'numeric', month: 'short' }); }
  function mm(minor, cur, signed) { return C().moneyMinor(minor, cur, signed); }
  var priceCache = {};
  function price(v, cur) {
    var c = C(), d = c.digits(cur), k = cur;
    if (!priceCache[k]) priceCache[k] = new Intl.NumberFormat(locFor(cur), { style: 'currency', currency: cur, minimumFractionDigits: d, maximumFractionDigits: d + 2 });
    return priceCache[k].format(v || 0);
  }
  function qty(q) { return String(Math.round((q || 0) * 1000) / 1000); }
  var STATUS = { draft: 'Draft', sent: 'Sent', issued: 'Issued', partial: 'Partial', overdue: 'Overdue', paid: 'Paid', 'refund-due': 'Refund due', void: 'Void', accepted: 'Accepted', declined: 'Declined', expired: 'Expired' };
  function statusTag(s) { return '<span class="status st-' + s + '">' + STATUS[s] + '</span>'; }
  var I = {
    plus: '<svg class="i" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
    x: '<svg class="i" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    up: '<svg class="i" viewBox="0 0 24 24"><path d="m6 15 6-6 6 6"/></svg>',
    down: '<svg class="i" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>',
    trash: '<svg class="i" viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
    edit: '<svg class="i" viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4Z"/></svg>',
    pdf: '<svg class="i" viewBox="0 0 24 24"><path d="M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z"/></svg>',
    mail: '<svg class="i" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
    back: '<svg class="i" viewBox="0 0 24 24"><path d="m15 6-6 6 6 6"/></svg>',
    sun: '<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    moon: '<svg class="i" viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/></svg>'
  };

  /* ============ THE PAPER ============ */
  function paper(d, opts) {
    opts = opts || {};
    var c = C(), s = c.state.settings, cur = d.currency, t = c.totals(d), st = c.status(d);
    var snap = d.snapshot || liveSnapshot(d);
    var b = snap.business, cl = snap.client, title = c.KIND_LABEL[d.kind];
    var meta = '<dt>Number</dt><dd>' + esc(d.number || 'Draft') + '</dd><dt>Date</dt><dd>' + esc(dfmt(d.date, cur)) + '</dd>';
    if (d.kind === 'invoice') meta += '<dt>Due</dt><dd>' + esc(dfmt(d.due, cur)) + '</dd>';
    if (d.kind === 'quote') meta += '<dt>Valid until</dt><dd>' + esc(dfmt(d.validUntil, cur)) + '</dd>';
    if (d.kind === 'credit') { var src = c.doc(d.links.creditOf); meta += '<dt>Credit for</dt><dd>' + esc(src ? src.number : '—') + '</dd>'; }
    var rows = d.lines.map(function (l, i) {
      var parts = (l.description || '').split(' — '), rate = c.taxRate(l.taxRateId) || { rate: 0 };
      if (d.snapshot && d.snapshot.rates && d.snapshot.rates[l.taxRateId]) rate = d.snapshot.rates[l.taxRateId];
      return '<tr class="' + (opts.highlight === l.id ? 'is-hl' : '') + '" data-line="' + esc(l.id) + '"><td><span class="d-main">' + (esc(parts[0]) || '<span style="opacity:.4">New line</span>') + '</span>' + (parts[1] ? '<span class="d-sub">' + esc(parts.slice(1).join(' — ')) + '</span>' : '') + '</td>' +
        '<td class="r">' + qty(l.qty) + '</td><td class="r">' + price(l.price, cur) + '</td><td class="r">' + (l.taxRateId === c.NO_TAX ? '—' : rate.rate + '%') + '</td><td class="r">' + mm(t.lines[i], cur) + '</td></tr>';
    }).join('');
    var tot = '<div><span>Subtotal</span><span>' + mm(t.subtotal, cur) + '</span></div>';
    if (t.discount) tot += '<div><span>Discount' + (d.discount.type === 'percent' ? ' ' + d.discount.value + '%' : '') + '</span><span>−' + mm(t.discount, cur) + '</span></div>';
    if (d.taxMode === 'exclusive') t.groups.forEach(function (g) { if (g.rate > 0 || t.groups.length > 1) tot += '<div><span>' + esc(g.name) + (g.rate > 0 ? ' on ' + mm(g.base, cur) : '') + '</span><span>' + mm(g.tax, cur) + '</span></div>'; });
    tot += '<div class="p-total"><span>Total' + (d.kind === 'credit' ? ' credit' : '') + '</span><span>' + mm(t.total, cur) + '</span></div>';
    if (d.taxMode === 'inclusive') t.groups.forEach(function (g) { if (g.rate > 0) tot += '<div class="p-incl"><span>Includes ' + esc(g.name) + '</span><span>' + mm(g.tax, cur) + '</span></div>'; });
    if (d.kind === 'invoice' && (d.status === 'issued')) {
      var bi = c.balanceInfo(d);
      if (bi.paid) tot += '<div><span>Paid</span><span>−' + mm(bi.paid, cur) + '</span></div>';
      if (bi.credited) tot += '<div><span>Credit notes</span><span>−' + mm(bi.credited, cur) + '</span></div>';
      if (bi.refunded) tot += '<div><span>Refunded</span><span>' + mm(bi.refunded, cur) + '</span></div>';
      tot += '<div class="p-due"><span>' + (bi.balance < 0 ? 'Owed to you' : 'Balance due') + '</span><span>' + mm(Math.abs(bi.balance), cur) + '</span></div>';
    }
    var stampKey = d.kind === 'invoice' ? st : null, showStamp = stampKey && ['paid', 'void', 'refund-due', 'overdue'].indexOf(stampKey) > -1 && !(opts.print && stampKey === 'overdue');
    /* The animated outer layer only moves; the ink texture lives on the still inner layer so it is drawn once */
    var stamp = showStamp ? '<div class="stamp ' + stampKey + (opts.land ? ' land' : '') + '"><div class="stamp-ink">' + (stampKey === 'refund-due' ? 'Refund due' : stampKey) + (stampKey === 'paid' ? '<small>' + esc(dfmt(lastPaymentDate(d), cur)) + '</small>' : '') + '</div></div>' : '';
    var logo = s.logo ? '<img class="p-logo" src="' + esc(s.logo) + '" alt="' + esc(b.name) + ' logo"/>' : '';
    return '<article class="paper ' + (s.paper === 'Letter' ? 'letter' : '') + '" aria-label="' + esc(title + ' ' + (d.number || 'draft')) + '"><div class="sheet">' +
      '<header class="p-head"><div class="p-from">' + logo + '<p class="p-biz">' + esc(b.name) + '</p><address class="p-addr">' + esc([b.address, b.email, b.phone, b.taxId].filter(Boolean).join('\n')) + '</address></div>' +
      '<div class="p-title"><h2>' + title + '</h2><dl class="p-meta">' + meta + '</dl></div></header>' +
      '<section class="p-parties"><div><span class="p-label">' + (d.kind === 'quote' ? 'Prepared for' : d.kind === 'credit' ? 'Credit to' : 'Bill to') + '</span><div class="p-client">' + esc(cl.name || 'Choose a client') + '</div><address class="p-addr">' + esc([cl.contact, cl.address, cl.email, cl.taxId].filter(Boolean).join('\n')) + '</address></div></section>' +
      '<table class="p-lines"><thead><tr><th>Description</th><th class="r">Qty</th><th class="r">Price</th><th class="r">Tax</th><th class="r">Amount</th></tr></thead><tbody>' + (rows || '<tr><td colspan="5" style="opacity:.45">Add a line to start</td></tr>') + '</tbody></table>' +
      '<section class="p-totals">' + tot + '</section>' +
      '<section class="p-foot">' + (d.kind !== 'credit' && b.payment ? '<div><span class="p-label">Payment details</span><p>' + esc(b.payment) + '</p></div>' : '<div></div>') + (d.notes ? '<div><span class="p-label">Notes</span><p>' + esc(d.notes) + '</p></div>' : '<div></div>') +
      (d.footer ? '<div class="p-footer">' + esc(d.footer) + '</div>' : '') + '</section></div>' +
      (d.status === 'draft' && !opts.print ? '<div class="watermark" aria-hidden="true">Draft</div>' : '') + stamp + '</article>';
  }
  function liveSnapshot(d) {
    var c = C(), p = c.state.settings.profile, cl = c.client(d.clientId) || {};
    return { business: { name: p.name, address: p.address, email: p.email, phone: p.phone, taxId: p.taxId, payment: p.payment }, client: { name: cl.name || '', contact: cl.contact, email: cl.email, address: cl.address, taxId: cl.taxId } };
  }
  function lastPaymentDate(d) { var ps = C().paymentsOf(d.id); return ps.length ? ps[ps.length - 1].date : d.date; }

  /* ============ TODAY ============ */
  function today() {
    var c = C(), s = c.state, t = c.today(), issued = s.docs.filter(function (d) { return d.kind === 'invoice' && d.status === 'issued'; });
    var owed = {};
    issued.forEach(function (d) { var bal = c.balanceInfo(d).balance; if (bal > 0) { var o = owed[d.currency] = owed[d.currency] || { amount: 0, n: 0, overdue: 0 }; o.amount += bal; o.n++; if (c.status(d, t) === 'overdue') o.overdue++; } });
    var curs = Object.keys(owed).sort(function (a, b) { return a === s.settings.currency ? -1 : b === s.settings.currency ? 1 : a < b ? -1 : 1; });
    var summary = curs.length ? curs.map(function (k) { var o = owed[k]; return '<p>You’re owed <span class="amount">' + mm(o.amount, k) + '</span> across ' + o.n + ' invoice' + (o.n > 1 ? 's' : '') + '. <span class="quiet">' + (o.overdue ? o.overdue + (o.overdue > 1 ? ' are' : ' is') + ' overdue.' : 'None are overdue.') + '</span></p>'; }).join('') : '<p>You’re all caught up. <span class="quiet">Nothing is waiting to be paid.</span></p>';
    var overdue = issued.filter(function (d) { return c.status(d, t) === 'overdue'; }).sort(function (a, b) { return a.due < b.due ? -1 : 1; });
    var drafts = s.docs.filter(function (d) { return d.status === 'draft'; }).sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    var expiring = s.docs.filter(function (d) { return d.kind === 'quote' && c.status(d, t) === 'sent' && c.diffDays(t, d.validUntil) <= 7; });
    var dueSoon = issued.filter(function (d) { var st = c.status(d, t); return (st === 'sent' || st === 'partial') && c.diffDays(t, d.due) <= 7; }).sort(function (a, b) { return a.due < b.due ? -1 : 1; });
    function sec(title, list, rowFn, empty) { return '<section><div class="sec-head"><h2>' + title + '</h2><span class="count">' + list.length + '</span></div>' + (list.length ? '<ul class="rows">' + list.map(rowFn).join('') + '</ul>' : '<p class="empty" style="text-align:left;padding:12px 0">' + empty + '</p>') + '</section>'; }
    function docRow(d, extra, action) {
      var cl = c.client(d.clientId), bal = d.kind === 'invoice' && d.status === 'issued' ? c.balanceInfo(d).balance : c.totals(d).total;
      return '<li><div class="row" role="button" tabindex="0" data-action="open-doc" data-id="' + esc(d.id) + '"><div class="row-main"><span class="row-title">' + esc(cl ? cl.name : 'No client') + '</span><span class="row-sub">' + esc((d.number || 'Draft ' + c.KIND_LABEL[d.kind].toLowerCase()) + ', ' + extra) + '</span></div>' +
        '<div class="row-side"><span class="row-amt">' + mm(bal, d.currency) + '</span>' + (action || '') + '</div></div></li>';
    }
    var ms = c.monthStart(t), cmpFrom = c.shiftMonth(ms, -1), cmpTo = c.shiftEnd(t, -1), now = c.collectedBetween(ms, t), prev = c.collectedBetween(cmpFrom, cmpTo);
    var colCurs = Object.keys(now).concat(Object.keys(prev)).filter(function (v, i, a) { return a.indexOf(v) === i; }).sort();
    var collected = colCurs.length ? colCurs.map(function (k) { var a = now[k] || 0, b2 = prev[k] || 0, d = a - b2; return '<div><b>' + mm(a, k) + '</b><small>' + (d === 0 ? 'Same as ' : '<span class="' + (d > 0 ? 'delta-up' : 'delta-down') + '">' + (d > 0 ? '▲ ' : '▼ ') + mm(Math.abs(d), k) + '</span> vs ') + esc(dshort(cmpFrom) + '–' + C().parts(cmpTo).d) + '</small></div>'; }).join('') : '<p class="soft">No payments yet this month.</p>';
    var focus = overdue[0] || drafts[0] || issued[issued.length - 1];
    return '<div class="page-head"><h1 class="page-title">Today</h1><div class="head-actions"><button type="button" class="btn btn-line" data-action="new-quote">' + I.plus + 'New quote</button><button type="button" class="btn btn-primary" data-action="new-invoice">' + I.plus + 'New invoice</button></div></div>' +
      '<div class="today"><div><div class="summary">' + summary + '</div><div class="attention">' +
      sec('Overdue', overdue, function (d) { return docRow(d, c.diffDays(d.due, t) + ' days overdue', '<button type="button" class="link" data-action="remind" data-id="' + esc(d.id) + '">Remind</button>'); }, 'Nothing is overdue.') +
      sec('Drafts to issue', drafts, function (d) { return docRow(d, d.links.scheduleId ? 'from a recurring schedule' : 'dated ' + dshort(d.date)); }, 'No drafts waiting.') +
      sec('Due in the next 7 days', dueSoon, function (d) { return docRow(d, 'due ' + dshort(d.due)); }, 'Nothing due this week.') +
      sec('Quotes expiring soon', expiring, function (d) { return docRow(d, 'valid until ' + dshort(d.validUntil)); }, 'No quotes expire this week.') +
      '<section><div class="sec-head"><h2>Collected this month</h2></div><div class="collected">' + collected + '</div></section>' +
      '</div></div>' + (focus ? '<aside class="desk-col"><p class="desk-caption"><span>' + (overdue[0] ? 'Most overdue' : drafts[0] ? 'Latest draft' : 'Latest invoice') + '</span><button type="button" class="link" data-action="open-doc" data-id="' + esc(focus.id) + '">Open</button></p><div class="desk">' + paper(focus) + '</div></aside>' : '') + '</div>';
  }

  /* ============ DOCUMENTS ============ */
  function filteredDocs() {
    var c = C(), v = V(), t = c.today(), q = v.search.trim().toLowerCase();
    return c.state.docs.filter(function (d) {
      if (v.kind !== 'all' && d.kind !== v.kind) return false;
      if (v.client !== 'all' && d.clientId !== v.client) return false;
      if (v.status !== 'all' && c.status(d, t) !== v.status) return false;
      if (q) { var cl = c.client(d.clientId); if ((d.number || 'draft').toLowerCase().indexOf(q) === -1 && !(cl && cl.name.toLowerCase().indexOf(q) > -1)) return false; }
      return true;
    }).sort(function (a, b) { if (a.status === 'draft' && b.status !== 'draft') return -1; if (b.status === 'draft' && a.status !== 'draft') return 1; return a.date < b.date ? 1 : a.date > b.date ? -1 : (a.number < b.number ? 1 : -1); });
  }
  function documents() {
    var c = C(), v = V(), t = c.today(), list = filteredDocs();
    if (!v.selected || !c.doc(v.selected)) v.selected = list[0] ? list[0].id : null;
    var chips = [['all', 'All'], ['invoice', 'Invoices'], ['quote', 'Quotes'], ['credit', 'Credit notes']].map(function (k) { return '<button type="button" class="chip" aria-pressed="' + (v.kind === k[0]) + '" data-action="kind" data-id="' + k[0] + '">' + k[1] + '</button>'; }).join('');
    var statuses = ['all', 'draft', 'sent', 'partial', 'overdue', 'paid', 'refund-due', 'void', 'accepted', 'declined', 'expired', 'issued'];
    var rows = list.map(function (d) {
      var cl = c.client(d.clientId), amt = d.kind === 'invoice' && d.status === 'issued' ? c.totals(d).total : c.totals(d).total, st = c.status(d, t);
      return '<li><button type="button" class="row" data-action="select-doc" data-id="' + esc(d.id) + '" aria-current="' + (d.id === v.selected) + '"><span class="row-main"><span class="row-title">' + esc(d.number || 'Draft ' + c.KIND_LABEL[d.kind].toLowerCase()) + '</span><span class="row-sub">' + esc((cl ? cl.name : 'No client') + ', ' + dshort(d.date)) + '</span></span>' +
        '<span class="row-side"><span class="row-amt">' + (d.kind === 'credit' ? '−' : '') + mm(amt, d.currency) + '</span>' + statusTag(st) + '</span></button></li>';
    }).join('');
    var sel_ = v.selected ? c.doc(v.selected) : null;
    return '<div class="page-head"><h1 class="page-title">Documents</h1><div class="head-actions"><button type="button" class="btn btn-line" data-action="new-quote">' + I.plus + 'New quote</button><button type="button" class="btn btn-primary" data-action="new-invoice">' + I.plus + 'New invoice</button></div></div>' +
      '<div class="docs' + (v.docOpen ? ' has-open' : '') + '"><div class="doc-list"><div class="doc-filters"><div class="chips">' + chips + '</div><div class="grid-2">' +
      '<label><span class="sr-only">Status</span><select class="ctl" id="fStatus">' + statuses.map(function (s) { return '<option value="' + s + '"' + sel(v.status, s) + '>' + (s === 'all' ? 'Any status' : STATUS[s]) + '</option>'; }).join('') + '</select></label>' +
      '<label><span class="sr-only">Client</span><select class="ctl" id="fClient"><option value="all">Any client</option>' + c.state.clients.map(function (cl) { return '<option value="' + esc(cl.id) + '"' + sel(v.client, cl.id) + '>' + esc(cl.name) + '</option>'; }).join('') + '</select></label></div>' +
      '<label><span class="sr-only">Search</span><input class="ctl" type="search" id="fSearch" placeholder="Search number or client  ( / )" value="' + esc(v.search) + '"/></label></div>' +
      '<ul class="rows">' + (rows || '<li><p class="empty">No documents match these filters.</p></li>') + '</ul></div>' +
      '<div class="viewer">' + (sel_ ? viewer(sel_) : '<p class="empty">No invoices yet. Create your first invoice to see it here.</p>') + '</div></div>';
  }
  function viewer(d) {
    var c = C(), t = c.today(), st = c.status(d, t), A = [];
    function b(action, label, cls, icon) { A.push('<button type="button" class="btn ' + (cls || 'btn-line') + '" data-action="' + action + '" data-id="' + esc(d.id) + '">' + (icon || '') + label + '</button>'); }
    if (d.status === 'draft') { b('edit', 'Edit draft', 'btn-line', I.edit); b('issue', 'Issue ' + c.KIND_LABEL[d.kind].toLowerCase(), 'btn-primary'); }
    if (d.kind === 'invoice' && d.status === 'issued') {
      var bal = c.balanceInfo(d).balance;
      if (bal > 0) { b('pay', 'Record payment', 'btn-primary'); b('remind', 'Remind', 'btn-line', I.mail); }
      if (bal < 0) b('refund', 'Record refund', 'btn-primary');
      b('credit', 'Create credit note'); b('repeat', 'Repeat');
    }
    if (d.kind === 'quote' && (st === 'sent' || st === 'expired') && !d.links.invoiceId) { b('convert', 'Convert to invoice', 'btn-primary'); if (st === 'sent') { b('accept', 'Mark accepted'); b('decline', 'Mark declined'); } }
    if (d.status !== 'draft') b('pdf', 'Download PDF', 'btn-line', I.pdf);
    b('duplicate', 'Duplicate');
    if (d.kind === 'invoice' && d.status === 'issued' && !c.paymentsOf(d.id).length && !c.creditsOf(d.id, true).length) b('void', 'Void', 'btn-ghost-danger');
    if (d.status === 'draft') b('delete', 'Delete draft', 'btn-ghost-danger', I.trash);
    var cl = c.client(d.clientId), info = [];
    if (d.links.quoteId) { var q = c.doc(d.links.quoteId); if (q) info.push('Converted from ' + (q.number || 'a quote')); }
    if (d.links.invoiceId) { var iv = c.doc(d.links.invoiceId); if (iv) info.push('Converted to ' + (iv.number || 'a draft invoice')); }
    if (d.links.scheduleId) info.push('Created by a recurring schedule');
    c.creditsOf(d.id, true).forEach(function (cn) { info.push('Credit note ' + cn.number); });
    var pays = d.kind === 'invoice' ? c.paymentsOf(d.id) : [];
    if (d.reminders && d.reminders.length) info.push('Reminder sent ' + dshort(d.reminders[d.reminders.length - 1].date));
    return '<div class="actionbar"><button type="button" class="btn btn-line btn-icon back" data-action="close-doc" aria-label="Back to list">' + I.back + '</button>' + A.join('') + '</div>' +
      '<p class="meta-line">' + statusTag(st) + ' &nbsp; ' + esc(cl ? cl.name : '') + (info.length ? ' &nbsp; ' + esc(info.join('; ')) : '') + '</p>' +
      (pays.length ? '<details class="note" style="margin-bottom:14px"><summary>' + pays.length + ' payment' + (pays.length > 1 ? 's' : '') + ' recorded</summary><ul class="rows">' + pays.map(function (p) { return '<li style="display:flex;justify-content:space-between;gap:10px;padding:6px 0;align-items:center"><span>' + esc(dshort(p.date)) + ', ' + esc(p.kind === 'refund' ? 'Refund' : p.method || 'Payment') + (p.note ? ' (' + esc(p.note) + ')' : '') + '</span><span class="tnum">' + (p.kind === 'refund' ? '−' : '') + esc(C().money(p.amount, d.currency)) + ' <button type="button" class="tool" data-action="del-payment" data-id="' + esc(p.id) + '" aria-label="Delete payment">' + I.trash + '</button></span></li>'; }).join('') + '</ul></details>' : '') +
      '<div class="desk" id="paperHost">' + paper(d, { land: V().landStamp === d.id }) + '</div>';
  }

  /* ============ EDITOR ============ */
  function editor(d) {
    var c = C(), v = V(), s = c.state, t = c.totals(d), kind = c.KIND_LABEL[d.kind].toLowerCase();
    var clientOpts = '<option value="">Choose a client…</option>' + s.clients.filter(function (x) { return !x.archived || x.id === d.clientId; }).map(function (x) { return '<option value="' + esc(x.id) + '"' + sel(d.clientId, x.id) + '>' + esc(x.name) + '</option>'; }).join('');
    var rateOpts = function (id) { return s.settings.taxRates.map(function (r) { return '<option value="' + esc(r.id) + '"' + sel(id, r.id) + '>' + esc(r.name) + '</option>'; }).join('') + '<option value="' + c.NO_TAX + '"' + sel(id, c.NO_TAX) + '>No tax</option>'; };
    var lines = d.lines.map(function (l, i) {
      return '<div class="line' + (v.activeLine === l.id ? ' is-active' : '') + '" data-line="' + esc(l.id) + '">' +
        '<label class="l-desc"><span class="sr-only">Description</span><textarea class="ctl" data-lf="description" placeholder="Description (use “ — ” to add a detail line)">' + esc(l.description) + '</textarea></label>' +
        '<label class="l-qty field"><span>Qty</span><input class="ctl" type="number" min="0" step="any" data-lf="qty" value="' + esc(l.qty) + '"/></label>' +
        '<label class="l-price field"><span>Price</span><input class="ctl" type="number" min="0" step="any" data-lf="price" value="' + esc(l.price) + '"/></label>' +
        '<label class="l-tax field"><span>Tax</span><select class="ctl" data-lf="taxRateId">' + rateOpts(l.taxRateId) + '</select></label>' +
        '<span class="l-amt" data-amt="' + esc(l.id) + '">' + mm(t.lines[i], d.currency) + '</span>' +
        '<span class="l-tools"><button type="button" class="tool" data-line-act="up" aria-label="Move line up"' + (i === 0 ? ' disabled' : '') + '>' + I.up + '</button><button type="button" class="tool" data-line-act="down" aria-label="Move line down"' + (i === d.lines.length - 1 ? ' disabled' : '') + '>' + I.down + '</button><button type="button" class="tool" data-line-act="remove" aria-label="Remove line">' + I.trash + '</button></span></div>';
    }).join('');
    var terms = Object.keys(c.TERMS).map(function (k) { return '<option value="' + k + '"' + sel(d.terms, k) + '>' + c.TERMS[k].label + '</option>'; }).join('');
    var catalog = '<option value="">Add from catalog…</option>' + s.items.filter(function (x) { return !x.archived; }).map(function (x) { return '<option value="' + esc(x.id) + '">' + esc(x.name) + ' (' + esc(price(x.price, d.currency)) + ')</option>'; }).join('');
    var src = d.kind === 'credit' ? c.doc(d.links.creditOf) : null;
    return '<div class="page-head"><h1 class="page-title">' + (d.kind === 'credit' ? 'Credit note for ' + esc(src ? src.number : '') : 'Draft ' + kind) + '</h1><div class="head-actions"><button type="button" class="btn btn-line" data-action="editor-done">Done</button></div></div>' +
      '<div class="switch2 mode-switch" role="tablist"><button type="button" role="tab" aria-selected="' + (v.editorMode === 'edit') + '" data-action="mode" data-id="edit">Edit</button><button type="button" role="tab" aria-selected="' + (v.editorMode === 'preview') + '" data-action="mode" data-id="preview">Preview</button></div>' +
      '<div class="editor mode-' + v.editorMode + '"><div class="form-col">' +
      '<section class="form-sec"><h2>Client and dates</h2><div class="grid-2">' +
      '<label class="field"><span>Client</span><select id="eClient"' + (d.kind === 'credit' ? ' disabled' : '') + '>' + clientOpts + '</select></label>' +
      '<label class="field"><span>Currency</span><select id="eCurrency"' + (d.kind === 'credit' ? ' disabled' : '') + '>' + Object.keys(c.CURRENCIES).map(function (k) { return '<option value="' + k + '"' + sel(d.currency, k) + '>' + c.CURRENCIES[k].label + ' (' + k + ')</option>'; }).join('') + '</select></label>' +
      '<label class="field"><span>Date</span><input type="date" id="eDate" value="' + esc(d.date) + '"/></label>' +
      (d.kind === 'invoice' ? '<label class="field"><span>Payment terms</span><select id="eTerms">' + terms + '</select></label>' + (d.terms === 'custom' ? '<label class="field"><span>Due date</span><input type="date" id="eDue" value="' + esc(d.due) + '"/></label>' : '<p class="hint" style="align-self:end">Due ' + esc(dfmt(d.due)) + '</p>') : '') +
      (d.kind === 'quote' ? '<label class="field"><span>Valid until</span><input type="date" id="eValid" value="' + esc(d.validUntil) + '"/></label>' : '') + '</div>' +
      (d.kind !== 'credit' ? '<div class="field"><span>Prices</span><div class="switch2"><button type="button" aria-pressed="' + (d.taxMode === 'exclusive') + '" data-action="taxmode" data-id="exclusive">Exclude tax</button><button type="button" aria-pressed="' + (d.taxMode === 'inclusive') + '" data-action="taxmode" data-id="inclusive">Include tax</button></div></div>' : '') +
      (d.kind !== 'credit' ? '<button type="button" class="link" data-action="new-client-inline" style="align-self:flex-start">Add a new client</button>' : '') + '</section>' +
      '<section class="form-sec"><h2>Lines</h2><div class="lines" id="lines">' + (lines || '<p class="hint">No lines yet.</p>') + '</div>' +
      '<div class="btn-row"><button type="button" class="btn btn-line" data-action="add-line">' + I.plus + 'Add line</button><label><span class="sr-only">Add from catalog</span><select class="ctl" id="eCatalog" style="min-width:220px">' + catalog + '</select></label></div></section>' +
      '<section class="form-sec"><h2>Discount, notes and footer</h2><div class="grid-2"><label class="field"><span>Discount type</span><select id="eDiscType"><option value="percent"' + sel(d.discount.type, 'percent') + '>Percent</option><option value="fixed"' + sel(d.discount.type, 'fixed') + '>Fixed amount</option></select></label>' +
      '<label class="field"><span>Discount</span><input type="number" min="0" step="any" id="eDiscVal" value="' + esc(d.discount.value || '') + '" placeholder="0"/></label></div>' +
      '<label class="field"><span>Notes</span><textarea id="eNotes">' + esc(d.notes) + '</textarea></label><label class="field"><span>Footer</span><input type="text" id="eFooter" value="' + esc(d.footer) + '"/></label></section>' +
      '<div class="form-actions"><div class="sticky-total"><span>Total</span><span id="stickyTotal">' + mm(t.total, d.currency) + '</span></div><button type="button" class="btn btn-primary" data-action="issue" data-id="' + esc(d.id) + '">Issue ' + kind + '</button><button type="button" class="btn btn-line" data-action="editor-done">Save draft</button><button type="button" class="btn btn-ghost-danger" data-action="delete" data-id="' + esc(d.id) + '">' + I.trash + 'Delete draft</button></div>' +
      '</div><div class="preview-col"><div class="desk" id="paperHost">' + paper(d, { highlight: v.activeLine }) + '</div></div></div>';
  }

  /* ============ CLIENTS & ITEMS ============ */
  function clients() {
    var c = C(), t = c.today();
    var rows = c.state.clients.map(function (cl) {
      var owed = {}; c.state.docs.forEach(function (d) { if (d.clientId === cl.id && d.kind === 'invoice' && d.status === 'issued') { var b = c.balanceInfo(d).balance; if (b > 0) owed[d.currency] = (owed[d.currency] || 0) + b; } });
      var n = c.state.docs.filter(function (d) { return d.clientId === cl.id && d.status !== 'draft'; }).length;
      return '<tr class="click' + (cl.archived ? ' is-archived' : '') + '" data-action="client" data-id="' + esc(cl.id) + '" tabindex="0"><td><b>' + esc(cl.name) + '</b><span class="sub">' + esc(cl.contact || cl.email || '') + '</span></td><td>' + esc(cl.currency) + '</td><td>' + esc(c.TERMS[cl.terms].label) + '</td><td class="r">' + n + '</td><td class="r">' + (Object.keys(owed).map(function (k) { return mm(owed[k], k); }).join('<br>') || '—') + '</td></tr>';
    }).join('');
    void t;
    return '<div class="page-head"><h1 class="page-title">Clients</h1><div class="head-actions"><button type="button" class="btn btn-primary" data-action="client-new">' + I.plus + 'Add client</button></div></div>' +
      '<div class="table-wrap"><table class="table"><thead><tr><th>Client</th><th>Currency</th><th>Terms</th><th class="r">Documents</th><th class="r">Outstanding</th></tr></thead><tbody>' + (rows || '<tr><td colspan="5" class="empty">No clients yet. Add your first client to start invoicing.</td></tr>') + '</tbody></table></div>';
  }
  function clientDetail(cl) {
    var c = C(), docs = c.state.docs.filter(function (d) { return d.clientId === cl.id; }).sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    return '<dl class="kv"><dt>Contact</dt><dd>' + esc(cl.contact || '—') + '</dd><dt>Email</dt><dd>' + esc(cl.email || '—') + '</dd><dt>Address</dt><dd style="white-space:pre-line">' + esc(cl.address || '—') + '</dd><dt>Tax id</dt><dd>' + esc(cl.taxId || '—') + '</dd><dt>Defaults</dt><dd>' + esc(cl.currency + ', ' + c.TERMS[cl.terms].label) + '</dd></dl>' +
      '<h3 style="font-size:15px;margin-top:6px">Documents</h3><ul class="rows">' + (docs.map(function (d) { return '<li><button type="button" class="row" data-doc-open="' + esc(d.id) + '"><span class="row-main"><span class="row-title">' + esc(d.number || 'Draft ' + c.KIND_LABEL[d.kind].toLowerCase()) + '</span><span class="row-sub">' + esc(dshort(d.date)) + '</span></span><span class="row-side"><span class="row-amt">' + mm(c.totals(d).total, d.currency) + '</span>' + statusTag(c.status(d)) + '</span></button></li>'; }).join('') || '<li><p class="empty">No documents yet.</p></li>') + '</ul>';
  }
  function clientForm(cl) {
    var c = C();
    return '<div class="grid-2"><label class="field"><span>Name</span><input type="text" id="cName" maxlength="80" value="' + esc(cl.name) + '"/></label><label class="field"><span>Contact person</span><input type="text" id="cContact" maxlength="60" value="' + esc(cl.contact) + '"/></label>' +
      '<label class="field"><span>Email</span><input type="email" id="cEmail" maxlength="80" value="' + esc(cl.email) + '"/></label><label class="field"><span>Tax id</span><input type="text" id="cTax" maxlength="40" value="' + esc(cl.taxId) + '"/></label>' +
      '<label class="field"><span>Default currency</span><select id="cCur">' + Object.keys(c.CURRENCIES).map(function (k) { return '<option value="' + k + '"' + sel(cl.currency, k) + '>' + k + '</option>'; }).join('') + '</select></label>' +
      '<label class="field"><span>Default terms</span><select id="cTerms">' + Object.keys(c.TERMS).filter(function (k) { return k !== 'custom'; }).map(function (k) { return '<option value="' + k + '"' + sel(cl.terms, k) + '>' + c.TERMS[k].label + '</option>'; }).join('') + '</select></label></div>' +
      '<label class="field"><span>Address</span><textarea id="cAddr">' + esc(cl.address) + '</textarea></label>';
  }
  function items() {
    var c = C(), cur = c.state.settings.currency;
    var rows = c.state.items.map(function (it) { var r = c.taxRate(it.taxRateId); return '<tr class="click' + (it.archived ? ' is-archived' : '') + '" data-action="item" data-id="' + esc(it.id) + '" tabindex="0"><td><b>' + esc(it.name) + '</b><span class="sub">' + esc(it.description) + '</span></td><td class="r">' + price(it.price, cur) + '</td><td>' + esc(r ? r.name : 'No tax') + '</td></tr>'; }).join('');
    return '<div class="page-head"><h1 class="page-title">Items</h1><div class="head-actions"><button type="button" class="btn btn-primary" data-action="item-new">' + I.plus + 'Add item</button></div></div>' +
      '<p class="hint" style="margin:-8px 0 14px">Prices are added to documents as plain numbers in the document’s currency. Editing an item never changes existing documents.</p>' +
      '<div class="table-wrap"><table class="table"><thead><tr><th>Item</th><th class="r">Price</th><th>Tax</th></tr></thead><tbody>' + (rows || '<tr><td colspan="3" class="empty">No items yet. Add the services you sell most often.</td></tr>') + '</tbody></table></div>';
  }
  function itemForm(it) {
    var c = C();
    return '<label class="field"><span>Name</span><input type="text" id="iName" maxlength="80" value="' + esc(it.name) + '"/></label><label class="field"><span>Description</span><input type="text" id="iDesc" maxlength="140" value="' + esc(it.description) + '"/></label>' +
      '<div class="grid-2"><label class="field"><span>Unit price</span><input type="number" min="0" step="any" id="iPrice" value="' + esc(it.price) + '"/></label><label class="field"><span>Default tax</span><select id="iTax">' + c.state.settings.taxRates.map(function (r) { return '<option value="' + esc(r.id) + '"' + sel(it.taxRateId, r.id) + '>' + esc(r.name) + '</option>'; }).join('') + '<option value="' + c.NO_TAX + '"' + sel(it.taxRateId, c.NO_TAX) + '>No tax</option></select></label></div>';
  }

  /* ============ REPORTS ============ */
  function reports() {
    var c = C(), v = V(), rep = c.report(v.repFrom, v.repTo);
    var presets = [['month', 'This month'], ['last-month', 'Last month'], ['quarter', 'This quarter'], ['year', 'This year'], ['12m', 'Last 12 months'], ['custom', 'Custom']].map(function (p) { return '<button type="button" class="chip" aria-pressed="' + (v.repPreset === p[0]) + '" data-action="rep-preset" data-id="' + p[0] + '">' + p[1] + '</button>'; }).join('');
    var blocks = rep.map(function (b) {
      var cur = b.currency, ag = b.aging;
      return '<section class="cur-block"><h2 class="cur-head">' + esc(c.CURRENCIES[cur].label) + ' (' + cur + ')' + '</h2><div class="figures"><div class="figure"><span>Invoiced</span><b>' + mm(b.invoiced, cur) + '</b></div><div class="figure"><span>Collected</span><b>' + mm(b.collected, cur) + '</b></div><div class="figure"><span>Outstanding today</span><b>' + mm(b.outstanding, cur) + '</b></div></div>' +
        '<div class="rep-grid"><div><h3>Aging of what’s outstanding</h3><div class="aging">' + [['not-due', 'Not due', 'a-ok'], ['1-30', '1–30 days', 'a-late'], ['31-60', '31–60', 'a-bad'], ['61-90', '61–90', 'a-bad'], ['90+', '90+', 'a-bad']].map(function (a) { return '<div class="' + a[2] + '"><small>' + a[1] + '</small><b>' + mm(ag[a[0]], cur) + '</b></div>'; }).join('') + '</div></div>' +
        '<div><h3>Top clients</h3><table class="table"><tbody>' + (b.topClients.map(function (x) { return '<tr><td>' + esc(x.name) + '</td><td class="r">' + mm(x.amount, cur) + '</td></tr>'; }).join('') || '<tr><td class="soft">No invoices in this period.</td></tr>') + '</tbody></table></div>' +
        '<div><h3>Tax report</h3><table class="table"><thead><tr><th>Tax</th><th class="r">Taxable base</th><th class="r">Tax</th></tr></thead><tbody>' + (b.taxRows.map(function (x) { return '<tr><td>' + esc(x.name) + '</td><td class="r">' + mm(x.base, cur) + '</td><td class="r">' + mm(x.tax, cur) + '</td></tr>'; }).join('') || '<tr><td colspan="3" class="soft">No taxed documents in this period.</td></tr>') + '</tbody></table></div>' +
        '<div><h3>Quotes</h3><table class="table"><tbody><tr><td>Sent</td><td class="r">' + b.quotes.sent + '</td></tr><tr><td>Accepted</td><td class="r">' + b.quotes.accepted + '</td></tr><tr><td>Declined</td><td class="r">' + b.quotes.declined + '</td></tr><tr><td>Expired</td><td class="r">' + b.quotes.expired + '</td></tr><tr><td>Acceptance rate</td><td class="r">' + (b.acceptance === null ? '—' : b.acceptance.toFixed(1) + '%') + '</td></tr></tbody></table></div></div></section>';
    }).join('');
    return '<div class="page-head"><h1 class="page-title">Reports</h1><div class="head-actions"><button type="button" class="btn btn-line" data-action="csv-docs">Export documents CSV</button><button type="button" class="btn btn-line" data-action="csv-payments">Export payments CSV</button><button type="button" class="btn btn-line" data-action="csv-tax">Export tax CSV</button></div></div>' +
      '<div class="chips" style="margin-bottom:12px">' + presets + '</div>' + (v.repPreset === 'custom' ? '<div class="btn-row" style="margin-bottom:12px"><label class="field"><span>From</span><input type="date" id="rFrom" value="' + esc(v.repFrom) + '"/></label><label class="field"><span>To</span><input type="date" id="rTo" value="' + esc(v.repTo) + '"/></label></div>' : '') +
      '<p class="soft" style="margin:0 0 18px">' + esc(dfmt(v.repFrom) + ' to ' + dfmt(v.repTo)) + '. Each currency is reported separately; nothing is converted.</p>' + (blocks || '<p class="empty">No documents in this period.</p>');
  }

  /* ============ SETTINGS ============ */
  function settings() {
    var c = C(), s = c.state.settings, p = s.profile, year = c.parts(c.today()).y;
    function f(label, id, val, type) { return '<label class="field"><span>' + label + '</span><input type="' + (type || 'text') + '" data-profile="' + id + '" value="' + esc(val) + '"/></label>'; }
    function ta(label, id, val) { return '<label class="field"><span>' + label + '</span><textarea data-profile="' + id + '">' + esc(val) + '</textarea></label>'; }
    var rates = s.taxRates.map(function (r) { return '<li style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--line)"><span>' + esc(r.name) + ' <span class="soft">' + r.rate + '%</span></span><span><button type="button" class="tool" data-action="rate-edit" data-id="' + esc(r.id) + '" aria-label="Edit ' + esc(r.name) + '">' + I.edit + '</button><button type="button" class="tool" data-action="rate-del" data-id="' + esc(r.id) + '" aria-label="Delete ' + esc(r.name) + '">' + I.trash + '</button></span></li>'; }).join('');
    var numbering = ['invoice', 'quote', 'credit'].map(function (k) { return '<div class="grid-3" style="align-items:end"><label class="field"><span>' + c.KIND_LABEL[k] + ' prefix</span><input type="text" maxlength="6" data-prefix="' + k + '" value="' + esc(s.prefixes[k]) + '"/></label><label class="field"><span>Next number in ' + year + '</span><input type="number" min="1" step="1" id="next-' + k + '" value="' + c.nextNumberPreview(k, year) + '"/></label><button type="button" class="btn btn-line" data-action="set-next" data-id="' + k + '">Save</button></div>'; }).join('');
    return '<div class="page-head"><h1 class="page-title">Settings</h1></div><div class="settings">' +
      '<section><h2>Business profile</h2>' + f('Business name', 'name', p.name) + '<div class="grid-2">' + f('Email', 'email', p.email, 'email') + f('Phone', 'phone', p.phone) + '</div>' + f('Tax id', 'taxId', p.taxId) + ta('Address', 'address', p.address) + ta('Payment instructions', 'payment', p.payment) + ta('Default notes', 'notes', p.notes) + f('Default footer', 'footer', p.footer) +
      '<div class="field"><span>Logo</span><div class="logo-box">' + (s.logo ? '<img src="' + esc(s.logo) + '" alt="Current logo"/>' : '<span class="soft">No logo yet.</span>') + '<button type="button" class="btn btn-line" data-action="logo-upload">' + (s.logo ? 'Replace logo' : 'Upload logo') + '</button>' + (s.logo ? '<button type="button" class="btn btn-ghost-danger" data-action="logo-remove">Remove</button>' : '') + '</div><p class="hint">PNG or JPG. It is resized to 400 px wide. Issued documents show the current logo.</p></div></section>' +
      '<section><h2>Tax rates</h2><ul class="rows">' + rates + '</ul><button type="button" class="btn btn-line" data-action="rate-new" style="align-self:flex-start">' + I.plus + 'Add tax rate</button>' +
      '<h2 style="margin-top:18px">Numbering</h2><p class="hint">Numbers look like ' + esc(c.formatNumber('invoice', year, c.nextNumberPreview('invoice', year))) + '. They are given when a document is issued and restart each year. To continue from another tool, set the next number.</p>' + numbering +
      '<h2 style="margin-top:18px">Defaults</h2><div class="grid-2"><label class="field"><span>Default currency</span><select data-set="currency">' + Object.keys(c.CURRENCIES).map(function (k) { return '<option value="' + k + '"' + sel(s.currency, k) + '>' + k + '</option>'; }).join('') + '</select></label>' +
      '<label class="field"><span>Payment terms</span><select data-set="terms">' + Object.keys(c.TERMS).filter(function (k) { return k !== 'custom'; }).map(function (k) { return '<option value="' + k + '"' + sel(s.terms, k) + '>' + c.TERMS[k].label + '</option>'; }).join('') + '</select></label>' +
      '<label class="field"><span>Quotes valid for (days)</span><input type="number" min="1" step="1" data-set="quoteValidity" data-num value="' + esc(s.quoteValidity) + '"/></label>' +
      '<label class="field"><span>Paper size</span><select data-set="paper"><option' + sel(s.paper, 'A4') + '>A4</option><option' + sel(s.paper, 'Letter') + '>Letter</option></select></label>' +
      '<label class="field"><span>Theme</span><select data-set="theme"><option value="system"' + sel(s.theme, 'system') + '>Follow system</option><option value="light"' + sel(s.theme, 'light') + '>Light</option><option value="dark"' + sel(s.theme, 'dark') + '>Dark</option></select></label></div></section>' +
      '<section class="span-2"><h2>Data</h2><p class="note">Your data is saved in this browser only. Export a backup regularly, especially before clearing the browser or switching devices.</p><div class="btn-row"><button type="button" class="btn btn-ink" data-action="export">Export backup</button><button type="button" class="btn btn-line" data-action="import">Import backup</button><button type="button" class="btn btn-line" data-action="sample">Load sample data</button><button type="button" class="btn btn-danger" data-action="clear-all">Clear all data</button></div></section></div>';
  }

  N.ui = { esc: esc, I: I, paper: paper, today: today, documents: documents, viewer: viewer, editor: editor, clients: clients, clientDetail: clientDetail, clientForm: clientForm,
    items: items, itemForm: itemForm, reports: reports, settings: settings, filteredDocs: filteredDocs, dfmt: dfmt, price: price, statusTag: statusTag, mm: mm };
})();

const seed = window.ES_SEED;
const LS_KEY = 'es.manual-payments.v1';
const DONOR_KEY = 'es.donor-overrides.v1';

const el = id => document.getElementById(id);
const money = n => `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Math.round(n || 0))}`;
const dateFmt = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
const isoDate = d => d.toISOString().slice(0, 10);
const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
const lc = s => String(s ?? '').trim().toLowerCase();

function parseDate(v) {
  if (!v) return null;
  if (v instanceof Date) return new Date(v.getFullYear(), v.getMonth(), v.getDate());
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return new Date(v + 'T00:00:00');
  const m = String(v).match(/^([A-Za-z]{3})-(\d{1,2})-(\d{4})$/);
  if (m) return new Date(`${m[3]}-${String(months[m[1].toLowerCase()]).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}T00:00:00`);
  const d = new Date(v);
  return Number.isNaN(d) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
const months = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 };
const countDates = (start, end) => seed.ekadashiDates.reduce((n, x) => {
  const d = parseDate(x); return n + (d && d >= start && d <= end ? 1 : 0);
}, 0);
const keyNorm = s => lc(s).replace(/\s*-\s*/g, '-');
const cols = [
  { key: 'name', label: 'Donor Name', cell: d => d.name },
  { key: 'phone', label: 'Donor Phone / WhatsApp Number', cell: d => d.whatsappNumber },
  { key: 'email', label: 'Donor Email', cell: d => d.email },
  { key: 'registrationDate', label: 'Date of Registration', cell: d => fmt(metrics(d).start) },
  { key: 'pledgeValue', label: 'Pledge Value', cell: d => money(d.pledgeValue) },
  { key: 'passed', label: 'Number of Ekadashis Passed', cell: d => String(metrics(d).passed) },
  { key: 'promised', label: 'Ekadashis Promised', cell: d => String(metrics(d).promised) },
  { key: 'commitment', label: 'Total Pledge Commitment', cell: d => money(metrics(d).commitment) },
  { key: 'pledged', label: 'Pledged Amount Till Today', cell: d => money(metrics(d).pledged) },
  { key: 'paid', label: 'Amount Paid Till Today', cell: d => money(metrics(d).paid) },
  { key: 'defaultStatus', label: 'Default Status', cell: d => metrics(d).defaulted ? 'Yes' : 'No' },
  { key: 'delta', label: 'Default / Excess Amount', cell: d => money(metrics(d).delta) },
  { key: 'donorStatus', label: 'Donor Status', cell: d => donorView(d).donorStatus },
  { key: 'paymentStatus', label: 'Current Payment Status', cell: d => donorView(d).currentPaymentStatus },
  { key: 'mapped', label: 'Donor Mapped', cell: d => metrics(d).mapped ? 'Yes' : 'No' },
  { key: 'details', label: 'Other Details', filterable: false },
  { key: 'payments', label: 'Payment Details', filterable: false },
  { key: 'edit', label: 'Edit', filterable: false },
];
const colMap = Object.fromEntries(cols.map(c => [c.key, c]));
const filterableCols = cols.filter(c => c.filterable !== false);

const donorKey = d => d.key || d.donorId || `${lc(d.name)}-${String(d.whatsappNumber || '').replace(/\D/g,'')}-${lc(d.email)}`;
const manualPayments = loadJSON(LS_KEY, []);
const donorOverrides = loadJSON(DONOR_KEY, {});
const donors = seed.donors.map(d => ({ ...d, _key: donorKey(d), _reg: parseDate(d.registrationDate) }));
const donorMap = new Map(donors.map(d => [d._key, d]));
const donorLookup = new Map();
donors.forEach(d => {
  donorLookup.set(keyNorm(d._key), d._key);
  donorLookup.set(keyNorm(d.donorId), d._key);
  donorLookup.set(keyNorm(`${lc(d.name)}-${String(d.whatsappNumber || '').replace(/\D/g, '')}-${lc(d.email)}`), d._key);
  donorLookup.set(keyNorm(`${lc(d.name)}-${lc(d.email)}`), d._key);
});
function inferPaymentType(tx) {
  const t = `${tx.paymentType || ''} ${tx.paymentMode || ''} ${tx.sourceGroup || ''}`.toLowerCase();
  return /auto|upi/.test(t) ? 'Auto UPI' : 'Manual';
}
const txs = [...seed.payments, ...manualPayments].map(tx => {
  const key = tx.key || tx.donorId || `${lc(tx.name)}-${String(tx.whatsappNumber || '').replace(/\D/g,'')}-${lc(tx.email)}`;
  const candidates = [
    keyNorm(key),
    keyNorm(`${lc(tx.name)}-${String(tx.whatsappNumber || '').replace(/\D/g, '')}-${lc(tx.email)}`),
    keyNorm(`${lc(tx.name)}-${lc(tx.email)}`),
  ];
  return { ...tx, paymentType: tx.paymentType || inferPaymentType(tx), _date: parseDate(tx.paymentDate), _key: key, _donorKey: candidates.map(k => donorLookup.get(k)).find(Boolean) || '' };
});

const state = {
  rows: [],
  donor: null,
  filters: {},
  filterMenu: null,
  search: '',
};

function loadJSON(key, fallback) { try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; } }
function saveJSON(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
function fmt(d) { return d ? dateFmt.format(d) : '—'; }

function donorView(d) {
  const o = donorOverrides[d._key] || {};
  return {
    donorStatus: o.donorStatus || 'Active',
    currentPaymentStatus: o.currentPaymentStatus || (/yes|auto/i.test(String(d.autoDebit || '')) ? 'Auto UPI' : 'Manual'),
  };
}

function donorTx(d) {
  return txs.filter(t => t._donorKey === d._key);
}

function metrics(d) {
  const start = d._reg;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const passed = countDates(start, today);
  const promised = 48;
  const commitment = promised * (Number(d.pledgeValue) || 0);
  const payments = donorTx(d);
  const paid = payments.reduce((n, t) => n + (Number(t.amountPaid) || 0), 0);
  const pledged = passed * (Number(d.pledgeValue) || 0);
  const delta = paid - pledged;
  const defaultStatus = paid < pledged ? 'Yes' : paid < commitment ? 'No' : 'Fully Paid';
  return { start, passed, promised, commitment, paid, pledged, delta, defaultStatus, defaulted: paid < pledged, mapped: payments.length > 0, payments };
}

function applyFilters() {
  const q = lc(state.search);
  state.rows = donors.slice().sort((a, b) => {
    const A = metrics(a), B = metrics(b);
    return (Number(B.defaulted) - Number(A.defaulted)) || (A.delta - B.delta) || (B.start - A.start);
  }).filter(d => {
    const dv = donorView(d);
    const row = rowValues(d);
    const hay = `${Object.values(row).join(' ')} ${dv.donorStatus} ${dv.currentPaymentStatus} ${mtext(d)}`.toLowerCase();
    if (q && !hay.includes(q)) return false;
    return Object.entries(state.filters).every(([k, set]) => set === undefined ? true : set.has(row[k]));
  });
}

function renderStats() {
  const active = donors.filter(d => donorView(d).donorStatus === 'Active').map(metrics);
  const activeCount = active.length;
  const expected = active.reduce((n, m) => n + m.pledged, 0);
  const collected = active.reduce((n, m) => n + m.paid, 0);
  const pending = expected - collected;
  const defaults = active.filter(m => m.defaultStatus === 'Yes').length;
  const cards = [
    ['Active Donors', activeCount],
    ['Expected Amount Till Today', money(expected)],
    ['Collected Amount Till Today', money(collected)],
    ['Pending Amount', money(pending)],
    ['Number of Default Donors', defaults],
  ];
  const wrap = document.getElementById('stats');
  if (wrap) wrap.innerHTML = cards.map(([l,v]) => `<article class="card"><span>${esc(l)}</span><strong>${esc(v)}</strong></article>`).join('');
  el('asOf').textContent = `As of ${fmt(new Date())}`;
}

function renderTable() {
  el('rows').innerHTML = state.rows.map(d => {
    const m = metrics(d);
    const dv = donorView(d);
    const rowClass = dv.donorStatus === 'Discontinued' ? 'row-discontinued' : (m.defaultStatus === 'Yes' ? 'row-bad' : 'row-good');
    return `<tr class="${rowClass}">
      <td class="sticky-name">${esc(d.name)}</td>
      <td class="num">${esc(d.whatsappNumber)}</td>
      <td>${esc(d.email)}</td>
      <td class="num">${esc(fmt(m.start))}</td>
      <td class="num">${esc(money(d.pledgeValue))}</td>
      <td class="num">${m.passed}</td>
      <td class="num">${m.promised}</td>
      <td class="num">${esc(money(m.commitment))}</td>
      <td class="num">${esc(money(m.pledged))}</td>
      <td class="num">${esc(money(m.paid))}</td>
      <td><span class="chip ${m.defaultStatus === 'Fully Paid' ? 'good' : m.defaultStatus === 'No' ? 'neutral' : 'bad'}">${esc(m.defaultStatus)}</span></td>
      <td class="num ${m.delta < 0 ? 'neg' : 'pos'}">${esc(money(m.delta))}</td>
      <td><span class="chip ${dv.donorStatus === 'Active' ? 'good' : 'bad'}">${esc(dv.donorStatus)}</span></td>
      <td><span class="chip ${dv.currentPaymentStatus === 'Auto UPI' ? 'good' : 'neutral'}">${esc(dv.currentPaymentStatus)}</span></td>
      <td><span class="chip ${m.mapped ? 'good' : 'bad'}">${m.mapped ? 'Yes' : 'No'}</span></td>
      <td><button class="linkbtn" data-act="details" data-k="${esc(d._key)}">View</button></td>
      <td><button class="linkbtn" data-act="payments" data-k="${esc(d._key)}">View</button></td>
      <td><button class="linkbtn" data-act="edit" data-k="${esc(d._key)}">Add</button></td>
    </tr>`;
  }).join('') || `<tr><td class="no-results" colspan="18">No matching donors found</td></tr>`;
  renderFilterState();
}

function rowValues(d) {
  const m = metrics(d);
  const dv = donorView(d);
  return {
    name: d.name,
    phone: d.whatsappNumber,
    email: d.email,
    registrationDate: fmt(m.start),
    pledgeValue: money(d.pledgeValue),
    passed: String(m.passed),
    promised: String(m.promised),
    commitment: money(m.commitment),
    pledged: money(m.pledged),
    paid: money(m.paid),
    defaultStatus: m.defaultStatus,
    delta: money(m.delta),
    mapped: m.mapped ? 'Yes' : 'No',
    donorStatus: dv.donorStatus,
    paymentStatus: dv.currentPaymentStatus,
  };
}

function mtext(d) {
  const dv = donorView(d);
  return [
    d.name, d.whatsappNumber, d.email, d.center, d.sevaka, d.introducedBy, d.pledgeValue,
    dv.donorStatus, dv.currentPaymentStatus, metrics(d).defaultStatus, donorTx(d).map(t => `${t.sourceGroup} ${t.paymentType} ${t.amountPaid} ${t.paymentMode} ${t.remarks || ''}`).join(' '),
  ].join(' ');
}

function renderFilterState() {
  document.querySelectorAll('.filter-btn').forEach(btn => {
    const key = btn.dataset.filterKey;
    btn.classList.toggle('active', !!(state.filters[key] && state.filters[key].size));
  });
}

function donorHtml(d) {
  const fields = [
    ['Introduced By', d.introducedBy], ['Address', d.address], ['Nakshatra', d.nakshatra], ['Gotra', d.gotra],
    ['Date of Birth', d.birthDate], ['Date of Puja', d.registrationDate], ['Names on Copper Plate', d.plateNames],
    ['Connected to M&S', d.connectedToMNS], ['Sevaka', d.sevaka], ['Center', d.center], ['Copper Inscription', d.copperInscription],
    ['Auto Debit', d.autoDebit], ['Birthday Puja Status', d.birthdayPujaStatus], ['Remarks', d.remarks], ['Donor ID', d.donorId],
    ['Ekadashis Elapsed', d.ekadashisElapsed],
  ];
  return `<div class="grid">${fields.map(([k,v]) => `<div class="kv"><label>${esc(k)}</label><div>${esc(v || '—')}</div></div>`).join('')}</div>`;
}

function paymentRows(d) {
  const m = metrics(d);
  return m.payments.sort((a,b)=>(a._date||0)-(b._date||0)).map(t => `<tr>
    <td>${esc(fmt(t._date))}</td><td class="num">${esc(money(t.amountPaid))}</td><td>${esc(t.sourceGroup || 'Other')}</td>
    <td><span class="chip ${t.paymentType === 'Auto UPI' ? 'good' : 'neutral'}">${esc(t.paymentType || 'Manual')}</span></td>
    <td>${esc(t.paymentMode || '—')}</td><td class="num">${esc(money(m.pledged))}</td><td class="num">${esc(money(m.paid))}</td>
    <td><span class="chip ${m.defaultStatus === 'Fully Paid' ? 'good' : m.defaultStatus === 'No' ? 'neutral' : 'bad'}">${esc(m.defaultStatus)}</span></td>
    <td class="num ${m.delta < 0 ? 'neg' : 'pos'}">${esc(money(m.delta))}</td>
    <td>${t.proofDataUrl ? `<a class="chip neutral" href="${esc(t.proofDataUrl)}" target="_blank">Proof</a>` : '—'}</td>
    <td>${esc(t.remarks || '—')}</td>
  </tr>`).join('');
}

function openDetails(d) {
  const m = metrics(d);
  const dlg = el('detailsDialog');
  dlg.innerHTML = `<form method="dialog"><div class="modal-head"><div><h2>${esc(d.name)}</h2><div class="chip ${m.defaulted ? 'bad' : 'good'}">${m.defaulted ? 'Default' : 'Up to date'}</div></div><button class="btn">Close</button></div><div class="modal-body">${donorHtml(d)}</div></form>`;
  dlg.showModal();
}

function openPayments(d) {
  const m = metrics(d);
  const dv = donorView(d);
  const dlg = el('paymentDialog');
  dlg.innerHTML = `<form method="dialog"><div class="modal-head"><div><h2>${esc(d.name)} payment history</h2><div class="chip ${dv.donorStatus === 'Active' ? 'good' : 'bad'}">${esc(dv.donorStatus)}</div></div><div class="modal-actions"><button type="button" class="btn" id="addPaymentBtn">Add payment</button><button class="btn">Close</button></div></div><div class="modal-body"><div class="grid">
    <div class="kv"><label>Donor Name</label><div>${esc(d.name)}</div></div><div class="kv"><label>WhatsApp Number</label><div>${esc(d.whatsappNumber)}</div></div><div class="kv"><label>Email</label><div>${esc(d.email)}</div></div>
    <div class="kv"><label>Pledge Value</label><div>${esc(money(d.pledgeValue))}</div></div><div class="kv"><label>Pledged Till Today</label><div>${esc(money(m.pledged))}</div></div><div class="kv"><label>Paid Till Today</label><div>${esc(money(m.paid))}</div></div>
  </div><div class="section"><h3>Transactions</h3><div style="overflow:auto"><table class="tx-table"><thead><tr><th>Date</th><th>Amount</th><th>Source</th><th>Payment Type</th><th>Mode</th><th>Pledged Till Today</th><th>Paid Till Today</th><th>Default</th><th>Delta</th><th>Proof</th><th>Remarks</th></tr></thead><tbody>${paymentRows(d) || '<tr><td colspan="11">No payments yet.</td></tr>'}</tbody></table></div></div></div></form>`;
  dlg.showModal();
  const btn = dlg.querySelector('#addPaymentBtn');
  if (btn) btn.onclick = () => openEdit(d);
}

function openEdit(d) {
  const dv = donorView(d);
  const dlg = el('editDialog');
  dlg.innerHTML = `<form id="editForm" class="modal-body"><div class="modal-head" style="padding:0 0 14px"><div><h2>Edit ${esc(d.name)}</h2><div class="chip neutral">${esc(donorKey(d))}</div></div><button type="button" class="btn" data-close>Close</button></div>
    <div class="form-grid">
      <div class="kv"><label>Donor Status</label><select name="donorStatus"><option ${dv.donorStatus==='Active'?'selected':''}>Active</option><option ${dv.donorStatus==='Discontinued'?'selected':''}>Discontinued</option></select></div>
      <div class="kv"><label>Current Payment Status</label><select name="currentPaymentStatus"><option ${dv.currentPaymentStatus==='Auto UPI'?'selected':''}>Auto UPI</option><option ${dv.currentPaymentStatus==='Manual'?'selected':''}>Manual</option></select></div>
      <div class="kv"><label>Amount paid</label><input name="amount" type="number" min="1" step="1"></div>
      <div class="kv"><label>Date of contribution</label><input name="date" type="date" inputmode="none"></div>
      <div class="kv"><label>Payment source</label><select name="source"><option>Easebuzz</option><option>Shopify</option><option>Other</option></select></div>
      <div class="kv"><label>Payment type</label><select name="paymentType"><option ${dv.currentPaymentStatus==='Auto UPI'?'selected':''}>Auto UPI</option><option ${dv.currentPaymentStatus==='Manual'?'selected':''}>Manual</option></select></div>
      <div class="kv"><label>Upload proof / screenshot / photo</label><input name="proof" type="file" accept="image/*,application/pdf"></div>
      <div class="kv full"><label>Optional remarks</label><input name="remarks" type="text" placeholder="Any context"></div>
    </div>
    <div class="modal-actions" style="margin-top:14px"><button class="btn" type="submit">Save</button></div>
  </form>`;
  dlg.querySelector('[data-close]').onclick = () => dlg.close();
  const dateInput = dlg.querySelector('input[name="date"]');
  const openPicker = () => dateInput.showPicker && dateInput.showPicker();
  dateInput.addEventListener('keydown', e => e.preventDefault());
  dateInput.addEventListener('focus', openPicker);
  dateInput.addEventListener('click', openPicker);
  dateInput.addEventListener('mousedown', openPicker);
  dlg.querySelector('#editForm').onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const file = fd.get('proof');
    const proof = file && file.size ? await readFile(file) : null;
    donorOverrides[d._key] = {
      donorStatus: String(fd.get('donorStatus') || 'Active'),
      currentPaymentStatus: String(fd.get('currentPaymentStatus') || 'Manual'),
    };
    saveJSON(DONOR_KEY, donorOverrides);
    const amt = Number(fd.get('amount'));
    const date = String(fd.get('date') || '');
    if (amt && date) {
      manualPayments.push({
        manual: true,
        sourceGroup: String(fd.get('source')),
        sourceRaw: String(fd.get('source')),
        paymentDate: date,
        amountPaid: amt,
        paymentMode: String(fd.get('source')),
        paymentType: String(fd.get('paymentType') || 'Manual'),
        remarks: String(fd.get('remarks') || ''),
        proofName: file && file.name || '',
        proofType: file && file.type || '',
        proofDataUrl: proof,
        name: d.name,
        whatsappNumber: d.whatsappNumber,
        email: d.email,
        pledgeValue: Number(d.pledgeValue) || 0,
        donorId: d.donorId,
        key: donorKey(d),
      });
      saveJSON(LS_KEY, manualPayments);
    }
    sync();
    dlg.close();
    openPayments(d);
  };
  dlg.showModal();
}

function readFile(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ''));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function allValuesFor(key) {
  const set = new Set();
  donors.forEach(d => set.add(rowValues(d)[key]));
  return [...set].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
}

function valuesForMenu(key) {
  const temp = state.filters[key];
  const values = new Set();
  donors.forEach(d => {
    const row = rowValues(d);
    const ok = Object.entries(state.filters).every(([k, set]) => {
      if (k === key) return true;
      return !set || !set.size || set.has(row[k]);
    });
    if (ok) values.add(row[key]);
  });
  return [...values].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
}

function openFilterMenu(btn) {
  const key = btn.dataset.filterKey;
  const col = colMap[key];
  if (!col || col.filterable === false) return;
  const menu = el('filterMenu');
  const current = state.filters[key] ? new Set([...state.filters[key]]) : new Set(valuesForMenu(key));
  const allValues = valuesForMenu(key);
  const rect = btn.getBoundingClientRect();
  state.filterMenu = { key, values: new Set(current), search: '' };
  menu.classList.remove('hidden');
  menu.style.left = `${Math.min(rect.left, window.innerWidth - 340)}px`;
  menu.style.top = `${Math.min(rect.bottom + 6, window.innerHeight - 20)}px`;
  menu.innerHTML = `
    <div class="filter-head">
      <div class="filter-title">${esc(col.label)}</div>
      <button type="button" class="btn btn-ghost" data-filter-close>✕</button>
    </div>
    <div class="filter-search"><input id="filterSearch" placeholder="Search values"></div>
    <div class="filter-tools">
      <label><input type="checkbox" id="filterAll" ${current.size === allValues.length ? 'checked' : ''}> Select All</label>
      <button type="button" data-filter-clear>Clear</button>
    </div>
    <div class="filter-list" id="filterList"></div>
    <div class="filter-actions">
      <button type="button" class="btn" data-filter-cancel>Cancel</button>
      <button type="button" class="btn" data-filter-apply>OK</button>
    </div>`;
  const search = menu.querySelector('#filterSearch');
  const list = menu.querySelector('#filterList');
  const all = menu.querySelector('#filterAll');
  const renderList = () => {
    const q = lc(search.value);
    const vals = allValues.filter(v => !q || lc(v).includes(q));
    list.innerHTML = vals.length ? vals.map(v => `
      <label class="filter-item">
        <input type="checkbox" data-val="${esc(v)}" ${current.has(v) ? 'checked' : ''}>
        <span>${esc(v || '(Blank)')}</span>
      </label>`).join('') : `<div class="filter-empty">No values</div>`;
    all.checked = vals.length > 0 && vals.every(v => current.has(v));
  };
  renderList();
  search.oninput = renderList;
  all.onchange = () => {
    list.querySelectorAll('input[type="checkbox"]').forEach(i => i.checked = all.checked);
    list.querySelectorAll('[data-val]').forEach(i => {
      const v = i.dataset.val;
      if (all.checked) current.add(v); else current.delete(v);
    });
  };
  list.onchange = e => {
    const cb = e.target.closest('input[type="checkbox"][data-val]');
    if (!cb) return;
    if (cb.checked) current.add(cb.dataset.val); else current.delete(cb.dataset.val);
    all.checked = list.querySelectorAll('[data-val]').length > 0 && [...list.querySelectorAll('[data-val]')].every(i => i.checked);
  };
  menu.querySelector('[data-filter-clear]').onclick = () => {
    current.clear();
    renderList();
  };
  menu.querySelector('[data-filter-cancel]').onclick = closeFilterMenu;
  menu.querySelector('[data-filter-apply]').onclick = () => {
    if (current.size === allValues.length) delete state.filters[key];
    else state.filters[key] = new Set(current);
    closeFilterMenu();
    sync();
  };
  menu.querySelector('[data-filter-close]').onclick = closeFilterMenu;
}

function closeFilterMenu() {
  const menu = el('filterMenu');
  menu.classList.add('hidden');
  menu.innerHTML = '';
  state.filterMenu = null;
}

function clearAllFilters() {
  state.filters = {};
  state.search = '';
  closeFilterMenu();
  const ms = document.getElementById('masterSearch');
  if (ms) ms.value = '';
  sync();
}

function syncFilterButtons() {
  document.querySelectorAll('.filter-btn').forEach(btn => {
    const key = btn.dataset.filterKey;
    btn.classList.toggle('active', key in state.filters);
  });
}

function sync() {
  txs.splice(0, txs.length, ...[...seed.payments, ...loadJSON(LS_KEY, [])].map(tx => {
    const key = tx.key || tx.donorId || `${lc(tx.name)}-${String(tx.whatsappNumber || '').replace(/\D/g,'')}-${lc(tx.email)}`;
    const candidates = [
      keyNorm(key),
      keyNorm(`${lc(tx.name)}-${String(tx.whatsappNumber || '').replace(/\D/g, '')}-${lc(tx.email)}`),
      keyNorm(`${lc(tx.name)}-${lc(tx.email)}`),
    ];
    return { ...tx, _date: parseDate(tx.paymentDate), _key: key, _donorKey: candidates.map(k => donorLookup.get(k)).find(Boolean) || '' };
  }));
  applyFilters();
  renderTable();
  renderStats();
  syncFilterButtons();
}

document.addEventListener('click', e => {
  const fb = e.target.closest('.filter-btn');
  if (fb) {
    e.preventDefault();
    e.stopPropagation();
    if (state.filterMenu && state.filterMenu.key === fb.dataset.filterKey) closeFilterMenu();
    else openFilterMenu(fb);
    return;
  }
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const d = donorMap.get(b.dataset.k);
  if (!d) return;
  if (b.dataset.act === 'details') openDetails(d);
  if (b.dataset.act === 'payments') openPayments(d);
  if (b.dataset.act === 'edit') openEdit(d);
});

document.getElementById('clearAllFilters').onclick = clearAllFilters;
const masterSearch = document.getElementById('masterSearch');
if (masterSearch) masterSearch.addEventListener('input', e => { state.search = e.target.value; sync(); });
document.addEventListener('click', e => {
  const menu = el('filterMenu');
  if (menu.classList.contains('hidden')) return;
  if (menu.contains(e.target) || e.target.closest('.filter-btn')) return;
  closeFilterMenu();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeFilterMenu(); });

sync();

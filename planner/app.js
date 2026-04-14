/**
 * RWTH Stundenplan-Planer — Application Logic
 *
 * Auto-loads course data from kurse_komplett.json.
 * Supports click-to-add, conflict detection, and schedule grid rendering.
 */

// ══════════ STATE ══════════

const S = {
    all: [],
    selected: [],
    search: '',
    filterType: '',
    filterLS: '',
    filterSched: '',
};

const DAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr'];
const DAY_FULL = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
const DAY_SHORT_MAP = {
    'Montag': 0, 'Dienstag': 1, 'Mittwoch': 2, 'Donnerstag': 3, 'Freitag': 4, 'Samstag': 5,
    'Mo': 0, 'Di': 1, 'Mi': 2, 'Do': 3, 'Fr': 4, 'Sa': 5,
};
const T_START = 8, T_END = 20;
const COLORS = ['#4f8ff7', '#a78bfa', '#34d399', '#fbbf24', '#22d3ee', '#f43f5e', '#818cf8', '#fb923c', '#2dd4bf', '#f472b6'];

// ══════════ INIT ══════════

document.addEventListener('DOMContentLoaded', async () => {
    buildGrid();
    bindEvents();

    // Try to load from localStorage first, then fetch JSON
    if (!loadState()) {
        await fetchCourses();
    }
    render();
});

async function fetchCourses() {
    try {
        const res = await fetch('kurse_komplett.json');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        S.all = data.map((c, i) => ({ ...c, id: c.id || c['LV-Nr'] || `c${i}` }));
        populateFilters();
        saveState();
        toast(`${S.all.length} Kurse geladen`, 'success');
    } catch (e) {
        console.error('Failed to load courses:', e);
        toast('Kursdaten konnten nicht geladen werden. Starte einen lokalen Server.', 'error');
    }
}

function bindEvents() {
    const si = document.getElementById('search-input');
    si.addEventListener('input', e => {
        S.search = e.target.value.toLowerCase();
        document.getElementById('search-clear').classList.toggle('hidden', !e.target.value);
        renderList();
    });
    document.getElementById('search-clear').addEventListener('click', () => {
        si.value = ''; S.search = '';
        document.getElementById('search-clear').classList.add('hidden');
        renderList();
    });
    document.getElementById('filter-type').addEventListener('change', e => { S.filterType = e.target.value; renderList(); });
    document.getElementById('filter-lehrstuhl').addEventListener('change', e => { S.filterLS = e.target.value; renderList(); });
    document.getElementById('filter-schedule').addEventListener('change', e => { S.filterSched = e.target.value; renderList(); });
    document.getElementById('btn-export').addEventListener('click', exportSchedule);
    document.getElementById('btn-clear').addEventListener('click', clearAll);
}

// ══════════ GRID ══════════

function buildGrid() {
    const g = document.getElementById('schedule-grid');
    g.innerHTML = '';
    // Corner
    g.appendChild(el('div', 'g-corner'));
    // Day headers
    DAYS.forEach(d => { const e = el('div', 'g-day'); e.textContent = d; g.appendChild(e); });
    // Update grid template rows
    const rows = T_END - T_START;
    g.style.gridTemplateRows = `32px repeat(${rows}, var(--grid-row-h))`;
    // Time rows
    for (let h = T_START; h < T_END; h++) {
        const t = el('div', 'g-time');
        t.textContent = `${h}:00`;
        t.style.gridRow = (h - T_START + 2);
        g.appendChild(t);
        for (let d = 0; d < 5; d++) {
            const c = el('div', 'g-cell');
            c.style.gridRow = (h - T_START + 2);
            c.style.gridColumn = (d + 2);
            g.appendChild(c);
        }
    }
}

// ══════════ SLOTS & CONFLICTS ══════════

function getSlots(course) {
    return (course.Termine || []).map(t => {
        const day = DAY_SHORT_MAP[t.tag];
        if (day === undefined || day > 4) return null;
        const s = parseT(t.von), e = parseT(t.bis);
        if (s == null || e == null) return null;
        return { day, start: s, end: e, t };
    }).filter(Boolean);
}

function parseT(s) {
    if (!s) return null;
    const [h, m] = s.split(':').map(Number);
    return h + m / 60;
}

function conflicts(a, b) {
    const sa = getSlots(a), sb = getSlots(b);
    for (const x of sa) for (const y of sb)
        if (x.day === y.day && x.start < y.end && x.end > y.start) return true;
    return false;
}

function conflictIds() {
    const set = new Set();
    for (const c of S.all) {
        if (S.selected.some(s => s.id === c.id)) continue;
        if (getSlots(c).length === 0) continue;
        for (const sel of S.selected) if (conflicts(c, sel)) { set.add(c.id); break; }
    }
    return set;
}

function conflictCount() {
    let n = 0;
    for (let i = 0; i < S.selected.length; i++)
        for (let j = i + 1; j < S.selected.length; j++)
            if (conflicts(S.selected[i], S.selected[j])) n++;
    return n;
}

// ══════════ RENDER ══════════

function render() {
    renderList();
    renderGrid();
    renderSelected();
    updateStats();
}

function renderList() {
    const box = document.getElementById('course-list');
    const cIds = conflictIds();

    let items = S.all.filter(c => {
        if (S.search) {
            const hay = [c.Fachname, c.Vortragende, c.Lehrstuhl, c['LV-Nr']].join(' ').toLowerCase();
            if (!hay.includes(S.search)) return false;
        }
        if (S.filterType && c.Typ !== S.filterType) return false;
        if (S.filterLS && c.Lehrstuhl !== S.filterLS) return false;
        if (S.filterSched === 'has' && !(c.Termine && c.Termine.length)) return false;
        if (S.filterSched === 'none' && c.Termine && c.Termine.length) return false;
        return true;
    });

    // Sort: selected first, conflicts last, then alphabetic
    items.sort((a, b) => {
        const as = S.selected.some(s => s.id === a.id) ? 1 : 0;
        const bs = S.selected.some(s => s.id === b.id) ? 1 : 0;
        if (as !== bs) return bs - as;
        const ac = cIds.has(a.id) ? 1 : 0, bc = cIds.has(b.id) ? 1 : 0;
        if (ac !== bc) return ac - bc;
        return (a.Fachname || '').localeCompare(b.Fachname || '');
    });

    document.getElementById('course-count').textContent = items.length;
    box.innerHTML = '';

    if (!items.length) {
        box.innerHTML = `<div style="text-align:center;padding:40px 16px;color:var(--text-4);font-size:0.78rem;">
            ${S.all.length ? 'Keine Kurse gefunden' : 'Lade Kursdaten...'}</div>`;
        return;
    }

    for (const c of items) {
        const isSel = S.selected.some(s => s.id === c.id);
        const isCon = cIds.has(c.id);
        const hasSched = (c.Termine && c.Termine.length > 0);
        const ci = isSel ? S.selected.findIndex(s => s.id === c.id) % COLORS.length : hashCI(c.id);
        const color = COLORS[ci];

        const card = el('div', `course-card${isSel ? ' selected' : ''}${isCon ? ' conflicting' : ''}${!hasSched ? ' no-schedule' : ''}`);
        card.style.setProperty('--card-color', color);

        const tags = hasSched
            ? (c.Termine || []).map(t => {
                const d = (t.tag || '').substring(0, 2);
                return `<span class="tag">${d} ${t.von || ''}–${t.bis || ''}</span>`;
            }).join('')
            : '<span class="tag no-schedule-tag">Keine Termine</span>';

        card.innerHTML = `
            <div class="card-top">
                <span class="card-name">${esc(c.Fachname || '')}</span>
                ${c.Typ ? `<span class="card-badge">${c.Typ}</span>` : ''}
            </div>
            <div class="card-meta">
                ${c.Vortragende ? `<div class="card-meta-row"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg><span>${esc(c.Vortragende)}</span></div>` : ''}
                ${c.Lehrstuhl ? `<div class="card-meta-row"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg><span>${esc(c.Lehrstuhl)}</span></div>` : ''}
                ${c.SWS ? `<div class="card-meta-row" style="gap:8px"><span>${c.SWS} SWS</span>${c.ECTS ? `<span>${c.ECTS} ECTS</span>` : ''}</div>` : ''}
            </div>
            <div class="card-tags">${tags}</div>
            <div class="card-actions">
                ${isCon ? '<span class="card-conflict-label">⚠ Zeitkonflikt</span>' : ''}
                <button class="btn-add-card ${isSel ? 'is-selected' : ''}${isCon ? ' is-conflict' : ''}"
                    title="${isSel ? 'Entfernen' : isCon ? 'Konflikt' : 'Hinzufügen'}">${isSel ? '✓' : '+'}</button>
            </div>`;

        const btn = card.querySelector('.btn-add-card');
        if (isSel) {
            btn.onclick = (e) => { e.stopPropagation(); removeCourse(c.id); };
        } else {
            btn.onclick = (e) => {
                e.stopPropagation();
                addCourse(c.id);
                if (isCon) toast(`⚠ "${c.Fachname}" hat Zeitkonflikte`, 'error');
            };
        }

        box.appendChild(card);
    }
}

function renderGrid() {
    // Remove old blocks
    document.querySelectorAll('.schedule-block').forEach(e => e.remove());

    const grid = document.getElementById('schedule-grid');
    const rect = grid.getBoundingClientRect();
    const colW = (rect.width - 50) / 5;
    const rowH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--grid-row-h'));

    // Build a flat list of all (course, slot) pairs
    const allEntries = [];
    for (const course of S.selected) {
        const ci = S.selected.indexOf(course) % COLORS.length;
        for (const slot of getSlots(course)) {
            if (slot.day > 4) continue;
            allEntries.push({ course, slot, ci });
        }
    }

    // For each entry, find all others that overlap on the same day/time
    // and assign a column index + total column count for splitting
    for (let i = 0; i < allEntries.length; i++) {
        const a = allEntries[i];

        const group = allEntries.filter(b =>
            b.slot.day === a.slot.day &&
            b.slot.start < a.slot.end &&
            b.slot.end > a.slot.start
        );

        group.sort((x, y) => S.selected.indexOf(x.course) - S.selected.indexOf(y.course));

        a._colIndex = group.indexOf(a);
        a._colCount = group.length;
    }

    // Render each entry with its split position
    for (const { course, slot, ci, _colIndex, _colCount } of allEntries) {
        const top = 32 + (slot.start - T_START) * rowH + 1;
        const height = (slot.end - slot.start) * rowH - 2;
        if (height <= 0) continue;

        const slotW = (colW - 4) / _colCount;
        const left = 50 + slot.day * colW + 2 + _colIndex * slotW;
        const width = slotW - (_colCount > 1 ? 2 : 0);

        const color = COLORS[ci];
        const hasCon = _colCount > 1;

        const b = el('div', `schedule-block${hasCon ? ' has-conflict' : ''}`);
        b.style.cssText = `
            top:${top}px; left:${left}px; width:${width}px; height:${height}px;
            background:${color}18; border-color:${color}50; color:${color};
        `;

        const room = slot.t.raum || '';
        b.innerHTML = `
            <span class="sb-name">${esc(course.Fachname || '')}</span>
            <span class="sb-time">${slot.t.von || ''} – ${slot.t.bis || ''}</span>
            ${course.Typ ? `<span class="sb-type">${course.Typ}</span>` : ''}
            ${room ? `<span class="sb-room">${esc(room)}</span>` : ''}
            <button class="sb-remove" title="Entfernen">×</button>
        `;
        b.querySelector('.sb-remove').onclick = (e) => { e.stopPropagation(); removeCourse(course.id); };
        grid.appendChild(b);
    }
}

function renderSelected() {
    const box = document.getElementById('selected-list');
    if (!S.selected.length) {
        box.innerHTML = '<p class="empty-hint">Klicke auf <strong>+</strong> um Kurse hinzuzufügen</p>';
        return;
    }
    box.innerHTML = '';
    for (const c of S.selected) {
        const ci = S.selected.indexOf(c) % COLORS.length;
        const schedStr = (c.Termine || []).map(t => `${(t.tag || '').substring(0, 2)} ${t.von || ''}-${t.bis || ''}`).join(', ');
        const item = el('div', 'sel-item');
        item.innerHTML = `
            <div class="sel-dot" style="background:${COLORS[ci]}"></div>
            <div class="sel-info">
                <div class="sel-name">${esc(c.Fachname || '')}</div>
                <div class="sel-detail">${c.Typ || ''} ${schedStr ? '• ' + schedStr : '• Keine Termine'}</div>
            </div>
            <button class="sel-remove" title="Entfernen">×</button>`;
        item.querySelector('.sel-remove').onclick = () => removeCourse(c.id);
        box.appendChild(item);
    }
}

function updateStats() {
    const n = S.selected.length;
    const cc = conflictCount();
    let hrs = 0;
    for (const c of S.selected) for (const sl of getSlots(c)) hrs += sl.end - sl.start;

    document.querySelector('#stat-courses .stat-value').textContent = n;
    document.querySelector('#stat-hours .stat-value').textContent = hrs % 1 === 0 ? hrs : hrs.toFixed(1);
    const cv = document.querySelector('#stat-conflicts .stat-value');
    cv.textContent = cc;
    cv.classList.toggle('has-conflicts', cc > 0);
}

// ══════════ ACTIONS ══════════

function addCourse(id) {
    const c = S.all.find(x => x.id === id);
    if (!c || S.selected.some(x => x.id === id)) return;
    S.selected.push(c);
    saveState(); render();
    toast(`"${c.Fachname}" hinzugefügt`, 'success');
}

function removeCourse(id) {
    const i = S.selected.findIndex(x => x.id === id);
    if (i < 0) return;
    const c = S.selected[i];
    S.selected.splice(i, 1);
    saveState(); render();
    toast(`"${c.Fachname}" entfernt`, 'info');
}

function clearAll() {
    if (!S.selected.length) return;
    if (!confirm('Alle Kurse aus dem Stundenplan entfernen?')) return;
    S.selected = [];
    saveState(); render();
    toast('Stundenplan geleert', 'info');
}

function exportSchedule() {
    if (!S.selected.length) { toast('Keine Kurse ausgewählt', 'error'); return; }
    const data = {
        exported: new Date().toISOString(),
        courses: S.selected.map(c => ({
            'LV-Nr': c['LV-Nr'], Fachname: c.Fachname, Typ: c.Typ,
            SWS: c.SWS, ECTS: c.ECTS, Vortragende: c.Vortragende,
            Lehrstuhl: c.Lehrstuhl, Termine: c.Termine,
        }))
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'stundenplan.json';
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Stundenplan exportiert', 'success');
}

// ══════════ FILTERS ══════════

function populateFilters() {
    // Types
    const types = [...new Set(S.all.map(c => c.Typ).filter(Boolean))].sort();
    const tSel = document.getElementById('filter-type');
    tSel.innerHTML = '<option value="">Alle Typen</option>';
    types.forEach(t => { const o = document.createElement('option'); o.value = t; o.textContent = t; tSel.appendChild(o); });

    // Lehrstühle
    const lss = [...new Set(S.all.map(c => c.Lehrstuhl).filter(Boolean))].sort();
    const lSel = document.getElementById('filter-lehrstuhl');
    lSel.innerHTML = '<option value="">Alle Lehrstühle</option>';
    lss.forEach(l => { const o = document.createElement('option'); o.value = l; o.textContent = l.length > 45 ? l.substring(0, 45) + '…' : l; lSel.appendChild(o); });
}

// ══════════ PERSISTENCE ══════════

function saveState() {
    try {
        localStorage.setItem('rwth_pl_all', JSON.stringify(S.all));
        localStorage.setItem('rwth_pl_sel', JSON.stringify(S.selected.map(c => c.id)));
    } catch (e) { /* quota */ }
}

function loadState() {
    try {
        const raw = localStorage.getItem('rwth_pl_all');
        if (!raw) return false;
        S.all = JSON.parse(raw);
        const ids = JSON.parse(localStorage.getItem('rwth_pl_sel') || '[]');
        S.selected = ids.map(id => S.all.find(c => c.id === id)).filter(Boolean);
        populateFilters();
        return true;
    } catch (e) { return false; }
}

// ══════════ UTILS ══════════

function el(tag, cls) { const e = document.createElement(tag); if (cls) e.className = cls; return e; }
function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function hashCI(s) { let h = 0; for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h); return Math.abs(h) % COLORS.length; }

function toast(msg, type = 'info') {
    const c = document.getElementById('toast-container');
    const t = el('div', `toast ${type}`);
    const icons = { success: '✅', error: '❌', info: 'ℹ️' };
    t.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${esc(msg)}</span>`;
    c.appendChild(t);
    setTimeout(() => { t.classList.add('fade-out'); setTimeout(() => t.remove(), 250); }, 2500);
}
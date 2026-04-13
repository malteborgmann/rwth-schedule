/**
 * RWTH Stundenplan-Planer – Application Logic
 * 
 * Features:
 * - Import courses from CSV or JSON
 * - Drag & Drop courses into the schedule
 * - Automatic conflict detection (greyed out conflicting courses)
 * - Weekly schedule grid visualization
 * - Export schedule
 */

// ══════════════════════════════════════
// STATE
// ══════════════════════════════════════

const state = {
    allCourses: [],           // All imported courses
    selectedCourses: [],      // Courses added to the schedule
    colorIndex: 0,            // For assigning colors
    searchQuery: '',
    filterType: '',
    filterLehrstuhl: '',
};

const DAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr'];
const DAY_MAP = {
    'Mo': 0, 'Mo.': 0, 'Montag': 0, 'Monday': 0, 'Mon': 0,
    'Di': 1, 'Di.': 1, 'Dienstag': 1, 'Tuesday': 1, 'Tue': 1,
    'Mi': 2, 'Mi.': 2, 'Mittwoch': 2, 'Wednesday': 2, 'Wed': 2,
    'Do': 3, 'Do.': 3, 'Donnerstag': 3, 'Thursday': 3, 'Thu': 3,
    'Fr': 4, 'Fr.': 4, 'Freitag': 4, 'Friday': 4, 'Fri': 4,
    'Sa': 5, 'Sa.': 5, 'Samstag': 5, 'Saturday': 5, 'Sat': 5,
};

const TIME_START = 8;
const TIME_END = 20;
const COURSE_COLORS = [
    '#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#06b6d4',
    '#f43f5e', '#6366f1', '#f97316', '#14b8a6', '#ec4899',
];

// ══════════════════════════════════════
// INIT
// ══════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
    buildScheduleGrid();
    setupEventListeners();
    loadFromLocalStorage();
});

function setupEventListeners() {
    // Import button
    document.getElementById('btn-import').addEventListener('click', () => {
        document.getElementById('file-input').click();
    });
    document.getElementById('file-input').addEventListener('change', handleFileImport);

    // Export button
    document.getElementById('btn-export').addEventListener('click', exportSchedule);

    // Clear schedule
    document.getElementById('btn-clear-schedule').addEventListener('click', clearSchedule);

    // Search
    const searchInput = document.getElementById('search-input');
    searchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value.toLowerCase();
        const clearBtn = document.getElementById('search-clear');
        clearBtn.classList.toggle('hidden', !e.target.value);
        renderCourseList();
    });
    document.getElementById('search-clear').addEventListener('click', () => {
        searchInput.value = '';
        state.searchQuery = '';
        document.getElementById('search-clear').classList.add('hidden');
        renderCourseList();
    });

    // Filters
    document.getElementById('filter-type').addEventListener('change', (e) => {
        state.filterType = e.target.value;
        renderCourseList();
    });
    document.getElementById('filter-lehrstuhl').addEventListener('change', (e) => {
        state.filterLehrstuhl = e.target.value;
        renderCourseList();
    });

    // Global drag & drop for file import
    document.body.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (e.dataTransfer.types.includes('Files')) {
            document.body.classList.add('drag-over');
        }
    });
    document.body.addEventListener('dragleave', (e) => {
        if (e.relatedTarget === null || !document.body.contains(e.relatedTarget)) {
            document.body.classList.remove('drag-over');
        }
    });
    document.body.addEventListener('drop', (e) => {
        e.preventDefault();
        document.body.classList.remove('drag-over');
        if (e.dataTransfer.files.length) {
            handleFile(e.dataTransfer.files[0]);
        }
    });
}

// ══════════════════════════════════════
// SCHEDULE GRID
// ══════════════════════════════════════

function buildScheduleGrid() {
    const grid = document.getElementById('schedule-grid');
    // Clear existing time rows (keep header row = 6 elements)
    while (grid.children.length > 6) {
        grid.removeChild(grid.lastChild);
    }

    for (let hour = TIME_START; hour < TIME_END; hour++) {
        // Time label
        const timeLabel = document.createElement('div');
        timeLabel.className = 'grid-time-label';
        timeLabel.textContent = `${hour}:00`;
        grid.appendChild(timeLabel);

        // Day cells
        for (let day = 0; day < 5; day++) {
            const cell = document.createElement('div');
            cell.className = 'grid-cell';
            cell.dataset.day = day;
            cell.dataset.hour = hour;
            grid.appendChild(cell);
        }
    }
}

// ══════════════════════════════════════
// FILE IMPORT
// ══════════════════════════════════════

function handleFileImport(e) {
    const file = e.target.files[0];
    if (file) handleFile(file);
    e.target.value = ''; // Reset
}

function handleFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const content = e.target.result;
        try {
            if (file.name.endsWith('.json')) {
                parseJSON(content);
            } else if (file.name.endsWith('.csv')) {
                parseCSV(content);
            } else {
                showToast('Nur CSV und JSON Dateien werden unterstützt', 'error');
            }
        } catch (err) {
            console.error('Parse error:', err);
            showToast('Fehler beim Einlesen der Datei: ' + err.message, 'error');
        }
    };
    reader.readAsText(file);
}

function parseCSV(content) {
    const lines = content.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) {
        showToast('CSV-Datei ist leer', 'error');
        return;
    }

    // Parse header
    const header = parseCSVLine(lines[0]);
    const courses = [];

    for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        if (values.length < 2) continue;

        const course = {};
        header.forEach((h, idx) => {
            course[h.trim()] = (values[idx] || '').trim();
        });

        // Parse Termine from CSV format: "Mo 10:00-12:00 | Di 14:00-16:00"
        if (course['Termine'] && typeof course['Termine'] === 'string') {
            course['Termine'] = parseTermineString(course['Termine']);
        } else {
            course['Termine'] = [];
        }

        if (course['Fachname']) {
            course.id = course['LV-Nr'] || `course_${i}`;
            courses.push(course);
        }
    }

    state.allCourses = courses;
    populateLehrstuhlFilter();
    renderCourseList();
    updateStats();
    saveToLocalStorage();
    showToast(`${courses.length} Kurse importiert`, 'success');
}

function parseJSON(content) {
    const data = JSON.parse(content);
    const courses = Array.isArray(data) ? data : [data];

    courses.forEach((c, i) => {
        c.id = c['LV-Nr'] || c.id || `course_${i}`;
        if (!c['Termine']) c['Termine'] = [];
        if (typeof c['Termine'] === 'string') {
            c['Termine'] = parseTermineString(c['Termine']);
        }
    });

    state.allCourses = courses.filter(c => c['Fachname']);
    populateLehrstuhlFilter();
    renderCourseList();
    updateStats();
    saveToLocalStorage();
    showToast(`${state.allCourses.length} Kurse importiert`, 'success');
}

function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ';' && !inQuotes) {
            result.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current);
    return result.map(v => v.replace(/^"|"$/g, ''));
}

function parseTermineString(str) {
    if (!str || str.trim() === '') return [];
    
    const termine = [];
    const parts = str.split('|').map(s => s.trim()).filter(Boolean);
    
    for (const part of parts) {
        // Try: "Mo 10:00-12:00 (Raum 123)"
        const match = part.match(
            /^(Mo|Di|Mi|Do|Fr|Sa|So|Montag|Dienstag|Mittwoch|Donnerstag|Freitag)\.?\s*(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})(?:\s*\((.*?)\))?/i
        );
        if (match) {
            termine.push({
                tag: match[1].replace('.', ''),
                von: match[2],
                bis: match[3],
                raum: match[4] || ''
            });
        } else {
            // Try extracting day and time from raw text
            const dayMatch = part.match(/(Mo|Di|Mi|Do|Fr|Sa|So|Montag|Dienstag|Mittwoch|Donnerstag|Freitag)\.?/i);
            const timeMatch = part.match(/(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/);
            if (dayMatch && timeMatch) {
                termine.push({
                    tag: dayMatch[1].replace('.', ''),
                    von: timeMatch[1],
                    bis: timeMatch[2],
                    raw: part
                });
            }
        }
    }
    return termine;
}

// ══════════════════════════════════════
// CONFLICT DETECTION
// ══════════════════════════════════════

function getTimeSlots(course) {
    const slots = [];
    const termine = course['Termine'] || [];
    
    for (const t of termine) {
        const dayIdx = DAY_MAP[t.tag] ?? DAY_MAP[t.tag + '.'] ?? -1;
        if (dayIdx < 0 || dayIdx > 4) continue;
        
        const start = parseTime(t.von);
        const end = parseTime(t.bis);
        if (start === null || end === null) continue;
        
        slots.push({ day: dayIdx, start, end, termin: t });
    }
    return slots;
}

function parseTime(timeStr) {
    if (!timeStr) return null;
    const parts = timeStr.split(':');
    if (parts.length !== 2) return null;
    return parseInt(parts[0]) + parseInt(parts[1]) / 60;
}

function hasConflict(courseA, courseB) {
    const slotsA = getTimeSlots(courseA);
    const slotsB = getTimeSlots(courseB);
    
    for (const a of slotsA) {
        for (const b of slotsB) {
            if (a.day === b.day) {
                // Check time overlap
                if (a.start < b.end && a.end > b.start) {
                    return true;
                }
            }
        }
    }
    return false;
}

function getConflictingCourseIds() {
    const conflicting = new Set();
    
    for (const course of state.allCourses) {
        if (state.selectedCourses.find(s => s.id === course.id)) continue;
        
        const slots = getTimeSlots(course);
        if (slots.length === 0) continue;
        
        for (const selected of state.selectedCourses) {
            if (hasConflict(course, selected)) {
                conflicting.add(course.id);
                break;
            }
        }
    }
    return conflicting;
}

function countScheduleConflicts() {
    let conflicts = 0;
    for (let i = 0; i < state.selectedCourses.length; i++) {
        for (let j = i + 1; j < state.selectedCourses.length; j++) {
            if (hasConflict(state.selectedCourses[i], state.selectedCourses[j])) {
                conflicts++;
            }
        }
    }
    return conflicts;
}

// ══════════════════════════════════════
// RENDERING
// ══════════════════════════════════════

function renderCourseList() {
    const container = document.getElementById('course-list');
    const conflicting = getConflictingCourseIds();
    
    let filtered = state.allCourses.filter(c => {
        if (state.searchQuery) {
            const searchable = [
                c['Fachname'], c['Vortragende'], c['Lehrstuhl'], c['LV-Nr']
            ].join(' ').toLowerCase();
            if (!searchable.includes(state.searchQuery)) return false;
        }
        if (state.filterType && c['Typ'] !== state.filterType) return false;
        if (state.filterLehrstuhl && c['Lehrstuhl'] !== state.filterLehrstuhl) return false;
        return true;
    });

    // Sort: selected first, then conflicting last, then alphabetical
    filtered.sort((a, b) => {
        const aSelected = state.selectedCourses.find(s => s.id === a.id) ? 1 : 0;
        const bSelected = state.selectedCourses.find(s => s.id === b.id) ? 1 : 0;
        if (aSelected !== bSelected) return bSelected - aSelected;
        
        const aConflict = conflicting.has(a.id) ? 1 : 0;
        const bConflict = conflicting.has(b.id) ? 1 : 0;
        if (aConflict !== bConflict) return aConflict - bConflict;
        
        return (a['Fachname'] || '').localeCompare(b['Fachname'] || '');
    });

    // Update count
    document.getElementById('course-count').textContent = `${filtered.length} Kurse`;

    if (filtered.length === 0 && state.allCourses.length === 0) {
        container.innerHTML = `
            <div class="empty-state" id="empty-state">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="17 8 12 3 7 8"></polyline>
                    <line x1="12" y1="3" x2="12" y2="15"></line>
                </svg>
                <p>CSV oder JSON Datei importieren</p>
                <p class="hint">Klicke auf "Import" oder ziehe eine Datei hierher</p>
            </div>`;
        return;
    }

    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <p>Keine Kurse gefunden</p>
                <p class="hint">Versuche andere Suchbegriffe oder Filter</p>
            </div>`;
        return;
    }

    container.innerHTML = '';

    for (const course of filtered) {
        const isSelected = !!state.selectedCourses.find(s => s.id === course.id);
        const isConflicting = conflicting.has(course.id);
        const termine = course['Termine'] || [];
        const hasSchedule = termine.length > 0;
        const colorIdx = isSelected 
            ? state.selectedCourses.findIndex(s => s.id === course.id) % COURSE_COLORS.length
            : hashColor(course.id);
        const color = COURSE_COLORS[colorIdx];

        const card = document.createElement('div');
        card.className = `course-card${isSelected ? ' added' : ''}${isConflicting ? ' conflicting' : ''}${!hasSchedule ? ' no-schedule' : ''}`;
        card.style.setProperty('--card-accent', color);
        card.draggable = true;
        card.dataset.courseId = course.id;

        // Schedule tags
        let scheduleTags = '';
        if (hasSchedule) {
            scheduleTags = `<div class="course-schedule-tags">${
                termine.map(t => {
                    const dayName = t.tag || '?';
                    const time = t.von && t.bis ? `${t.von}–${t.bis}` : '';
                    return `<span class="schedule-tag">${dayName} ${time}</span>`;
                }).join('')
            }</div>`;
        } else {
            scheduleTags = `<div class="course-schedule-tags">
                <span class="schedule-tag">Keine Termine</span>
            </div>`;
        }

        card.innerHTML = `
            <div class="course-card-header">
                <span class="course-name">${escapeHtml(course['Fachname'] || '')}</span>
                ${course['Typ'] ? `<span class="course-type-badge" style="background:${color}">${course['Typ']}</span>` : ''}
            </div>
            <div class="course-meta">
                ${course['Vortragende'] ? `
                    <div class="course-meta-row">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                            <circle cx="12" cy="7" r="4"></circle>
                        </svg>
                        <span class="truncate">${escapeHtml(course['Vortragende'])}</span>
                    </div>` : ''}
                ${course['Lehrstuhl'] ? `
                    <div class="course-meta-row">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                        </svg>
                        <span class="truncate">${escapeHtml(course['Lehrstuhl'])}</span>
                    </div>` : ''}
            </div>
            ${scheduleTags}
            <div class="course-card-actions">
                ${isConflicting ? '<span style="font-size:0.65rem;color:var(--conflict-color)">⚠ Konflikt</span>' : ''}
                ${isSelected 
                    ? `<button class="btn-add added" title="Entfernen" onclick="removeCourse('${course.id}')">✓</button>`
                    : `<button class="btn-add${isConflicting ? ' conflict' : ''}" title="${isConflicting ? 'Konflikt mit bestehendem Kurs' : 'Zum Stundenplan hinzufügen'}" onclick="${isConflicting ? '' : `addCourse('${course.id}')`}">+</button>`
                }
            </div>`;

        // Drag events
        card.addEventListener('dragstart', (e) => {
            if (isConflicting || isSelected) {
                e.preventDefault();
                return;
            }
            e.dataTransfer.setData('text/plain', course.id);
            e.dataTransfer.effectAllowed = 'move';
            card.classList.add('dragging');
            document.getElementById('schedule-drop-zone').classList.remove('hidden');
        });
        card.addEventListener('dragend', () => {
            card.classList.remove('dragging');
            document.getElementById('schedule-drop-zone').classList.add('hidden');
        });

        container.appendChild(card);
    }

    // Setup drop zone
    const dropZone = document.getElementById('schedule-drop-zone');
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    });
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        const courseId = e.dataTransfer.getData('text/plain');
        if (courseId) addCourse(courseId);
        dropZone.classList.add('hidden');
    });
}

function renderScheduleGrid() {
    // Remove existing blocks
    document.querySelectorAll('.schedule-block').forEach(el => el.remove());

    const grid = document.getElementById('schedule-grid');
    const gridRect = grid.getBoundingClientRect();
    const colWidth = (gridRect.width - 56) / 5; // 56px = time label column
    const rowHeight = 48; // --grid-row-height

    for (const course of state.selectedCourses) {
        const slots = getTimeSlots(course);
        const colorIdx = state.selectedCourses.indexOf(course) % COURSE_COLORS.length;
        const color = COURSE_COLORS[colorIdx];

        for (const slot of slots) {
            if (slot.day > 4) continue;

            const top = 36 + (slot.start - TIME_START) * rowHeight + 1; // 36 = header row
            const height = (slot.end - slot.start) * rowHeight - 2;
            const left = 56 + slot.day * colWidth + 2; // 56 = time column

            if (top < 36 || height <= 0) continue;

            const block = document.createElement('div');
            block.className = 'schedule-block';
            block.style.top = `${top}px`;
            block.style.left = `${left}px`;
            block.style.width = `${colWidth - 4}px`;
            block.style.height = `${height}px`;
            block.style.background = `${color}20`;
            block.style.borderColor = `${color}60`;
            block.style.borderWidth = '1px';
            block.style.borderStyle = 'solid';
            block.style.color = color;

            // Check if this block overlaps with another
            for (const otherCourse of state.selectedCourses) {
                if (otherCourse.id === course.id) continue;
                if (hasConflict(course, otherCourse)) {
                    block.classList.add('conflict-block');
                    break;
                }
            }

            const timeStr = slot.termin.von && slot.termin.bis 
                ? `${slot.termin.von} – ${slot.termin.bis}` : '';

            block.innerHTML = `
                <span class="block-title">${escapeHtml(course['Fachname'] || '')}</span>
                <span class="block-time">${timeStr}</span>
                ${course['Typ'] ? `<span class="block-type">${course['Typ']}</span>` : ''}
                <button class="block-remove" onclick="removeCourse('${course.id}')" title="Entfernen">×</button>
            `;

            block.addEventListener('click', () => {
                // Could show details popup
            });

            grid.appendChild(block);
        }
    }
}

function renderSelectedCoursesList() {
    const container = document.getElementById('selected-courses-list');
    
    if (state.selectedCourses.length === 0) {
        container.innerHTML = '<p class="no-courses-msg">Ziehe Kurse aus der Liste oder klicke auf + um sie hinzuzufügen</p>';
        return;
    }

    container.innerHTML = '';
    for (const course of state.selectedCourses) {
        const colorIdx = state.selectedCourses.indexOf(course) % COURSE_COLORS.length;
        const color = COURSE_COLORS[colorIdx];
        const termine = (course['Termine'] || []);
        const scheduleStr = termine.map(t => `${t.tag || ''} ${t.von || ''}-${t.bis || ''}`).join(', ');

        const item = document.createElement('div');
        item.className = 'selected-course-item';
        item.innerHTML = `
            <div class="selected-course-color" style="background:${color}"></div>
            <div class="selected-course-info">
                <div class="selected-course-name">${escapeHtml(course['Fachname'] || '')}</div>
                <div class="selected-course-detail">${course['Typ'] || ''} ${scheduleStr ? '• ' + scheduleStr : ''}</div>
            </div>
            <button class="btn-remove" onclick="removeCourse('${course.id}')" title="Entfernen">×</button>
        `;
        container.appendChild(item);
    }
}

function updateStats() {
    const courseCount = state.selectedCourses.length;
    const conflicts = countScheduleConflicts();
    
    // Calculate total hours per week
    let totalHours = 0;
    for (const course of state.selectedCourses) {
        const slots = getTimeSlots(course);
        for (const slot of slots) {
            totalHours += slot.end - slot.start;
        }
    }

    document.querySelector('#stat-courses .stat-value').textContent = courseCount;
    document.querySelector('#stat-ects .stat-value').textContent = totalHours.toFixed(1);
    
    const conflictEl = document.querySelector('#stat-conflicts .stat-value');
    conflictEl.textContent = conflicts;
    conflictEl.classList.toggle('has-conflicts', conflicts > 0);
}

// ══════════════════════════════════════
// COURSE ACTIONS
// ══════════════════════════════════════

function addCourse(courseId) {
    const course = state.allCourses.find(c => c.id === courseId);
    if (!course) return;
    if (state.selectedCourses.find(c => c.id === courseId)) return;

    state.selectedCourses.push(course);
    
    renderCourseList();
    renderScheduleGrid();
    renderSelectedCoursesList();
    updateStats();
    saveToLocalStorage();
    
    showToast(`"${course['Fachname']}" hinzugefügt`, 'success');
}

window.addCourse = addCourse;

function removeCourse(courseId) {
    const idx = state.selectedCourses.findIndex(c => c.id === courseId);
    if (idx < 0) return;
    
    const course = state.selectedCourses[idx];
    state.selectedCourses.splice(idx, 1);
    
    renderCourseList();
    renderScheduleGrid();
    renderSelectedCoursesList();
    updateStats();
    saveToLocalStorage();
    
    showToast(`"${course['Fachname']}" entfernt`, 'info');
}

window.removeCourse = removeCourse;

function clearSchedule() {
    if (state.selectedCourses.length === 0) return;
    if (!confirm('Alle Kurse aus dem Stundenplan entfernen?')) return;
    
    state.selectedCourses = [];
    renderCourseList();
    renderScheduleGrid();
    renderSelectedCoursesList();
    updateStats();
    saveToLocalStorage();
    showToast('Stundenplan geleert', 'info');
}

// ══════════════════════════════════════
// EXPORT
// ══════════════════════════════════════

function exportSchedule() {
    if (state.selectedCourses.length === 0) {
        showToast('Keine Kurse im Stundenplan', 'warning');
        return;
    }

    const exportData = {
        exportDate: new Date().toISOString(),
        courses: state.selectedCourses.map(c => ({
            'LV-Nr': c['LV-Nr'],
            'Fachname': c['Fachname'],
            'Typ': c['Typ'],
            'Vortragende': c['Vortragende'],
            'Lehrstuhl': c['Lehrstuhl'],
            'Termine': c['Termine'],
        }))
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'stundenplan_export.json';
    a.click();
    URL.revokeObjectURL(url);
    
    showToast('Stundenplan exportiert', 'success');
}

// ══════════════════════════════════════
// FILTER POPULATION
// ══════════════════════════════════════

function populateLehrstuhlFilter() {
    const select = document.getElementById('filter-lehrstuhl');
    const lehrstuehle = [...new Set(state.allCourses.map(c => c['Lehrstuhl']).filter(Boolean))].sort();
    
    select.innerHTML = '<option value="">Alle Lehrstühle</option>';
    for (const ls of lehrstuehle) {
        const opt = document.createElement('option');
        opt.value = ls;
        opt.textContent = ls.length > 50 ? ls.substring(0, 50) + '...' : ls;
        select.appendChild(opt);
    }
}

// ══════════════════════════════════════
// LOCAL STORAGE
// ══════════════════════════════════════

function saveToLocalStorage() {
    try {
        localStorage.setItem('rwth_planner_courses', JSON.stringify(state.allCourses));
        localStorage.setItem('rwth_planner_selected', JSON.stringify(state.selectedCourses.map(c => c.id)));
    } catch (e) {
        console.warn('LocalStorage save failed:', e);
    }
}

function loadFromLocalStorage() {
    try {
        const courses = localStorage.getItem('rwth_planner_courses');
        const selectedIds = localStorage.getItem('rwth_planner_selected');
        
        if (courses) {
            state.allCourses = JSON.parse(courses);
            populateLehrstuhlFilter();
            
            if (selectedIds) {
                const ids = JSON.parse(selectedIds);
                state.selectedCourses = ids
                    .map(id => state.allCourses.find(c => c.id === id))
                    .filter(Boolean);
            }
            
            renderCourseList();
            renderScheduleGrid();
            renderSelectedCoursesList();
            updateStats();
        }
    } catch (e) {
        console.warn('LocalStorage load failed:', e);
    }
}

// ══════════════════════════════════════
// UTILITIES
// ══════════════════════════════════════

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function hashColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return Math.abs(hash) % COURSE_COLORS.length;
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    toast.innerHTML = `
        <span class="toast-icon">${icons[type] || 'ℹ️'}</span>
        <span>${escapeHtml(message)}</span>
    `;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

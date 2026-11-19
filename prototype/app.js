// TermHub Prototyp: klickbares Modell der Oberfläche mit nachgemachten Terminals.
// Kein Teil der App. Dient nur dazu, Aussehen und Bedienung abzustimmen (Ticket 02).
'use strict';

// ---------- Hilfen ----------
const $ = (sel, el = document) => el.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

const ICON_PATHS = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  gear: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  folderPlus: '<path d="M12 10v6M9 13h6"/><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  folderOpen: '<path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/>',
  terminal: '<path d="m4 17 6-6-6-6"/><path d="M12 19h8"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  pencil: '<path d="M21.17 6.81a1 1 0 0 0-3.99-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5z"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  duplicate: '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/><path d="M15 12v6M12 15h6"/>',
  history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
  closeOthers: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="m15 9-6 6M9 9l6 6"/>',
  palette: '<path d="M4 6h16M4 12h10M4 18h7"/>',
  sliders: '<path d="M20 7h-9M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>',
};
const icon = (name) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICON_PATHS[name]}</svg>`;

const WC_ICONS = {
  min: '<svg viewBox="0 0 10 10"><path d="M0 5h10"/></svg>',
  max: '<svg viewBox="0 0 10 10"><rect x="0.5" y="0.5" width="9" height="9" rx="1"/></svg>',
  restore: '<svg viewBox="0 0 10 10"><rect x="0.5" y="2.5" width="7" height="7" rx="1"/><path d="M2.5 2.5V1.5a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-1"/></svg>',
  close: '<svg viewBox="0 0 10 10"><path d="M0 0l10 10M10 0 0 10"/></svg>',
};

const SPARK = '<svg class="spark" viewBox="0 0 24 24"><path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6 5.6 18.4"/></svg>';
const TYPE_TERMINAL = '<svg class="ty" viewBox="0 0 24 24"><path d="m5 16 5-4-5-4"/><path d="M12 17h7"/></svg>';

/** Status-Symbol. Im Ruhezustand zeigt es den Typ des Tabs (Terminal oder Claude). */
function statusHtml(s, claude = false) {
  let inner;
  if (s === 'idle') inner = claude ? SPARK : TYPE_TERMINAL;
  else if (s === 'working')
    inner =
      state.workAnim === 'dots'
        ? '<span class="st-dots"><i></i><i></i><i></i></span>'
        : state.workAnim === 'arc'
          ? '<span class="st-arc"></span>'
          : SPARK;
  else if (s === 'paused')
    inner = '<svg viewBox="0 0 10 10"><rect x="1.5" y="1" width="2.6" height="8" rx="0.8"/><rect x="5.9" y="1" width="2.6" height="8" rx="0.8"/></svg>';
  else inner = '<span class="st-dot"></span>';
  return `<span class="st" data-s="${s}" data-v="${state.workAnim}">${inner}</span>`;
}
const tabIcon = (tab) => statusHtml(tab.status, tab.claude);

// ---------- Modell ----------
const HOME = 'C:\\Users\\dev';
const SHELLS = [
  { id: 'pwsh', label: 'PowerShell 7' },
  { id: 'powershell', label: 'Windows PowerShell' },
  { id: 'cmd', label: 'Eingabeaufforderung' },
  { id: 'gitbash', label: 'Git Bash' },
  { id: 'wsl:Ubuntu', label: 'Ubuntu (WSL)' },
];
const shellLabel = (id) => SHELLS.find((s) => s.id === id)?.label ?? id;

const STATUS_TEXT = {
  idle: 'Ruht',
  working: 'Claude arbeitet',
  waiting: 'Claude wartet auf dich',
  processes: 'Prozesse laufen',
  finished: 'Claude ist fertig (noch nicht angeschaut)',
  paused: 'Pausiert, wird beim Öffnen fortgesetzt',
};
const BUSY = new Set(['working', 'waiting', 'processes']);

let nextId = 1;
const mkTab = (o) => ({ id: `t${nextId++}`, custom: false, status: 'idle', claude: false, content: 'fresh', ...o });

const state = {
  theme: 'system',
  workAnim: 'spark',
  accent: 'mono',
  fontSize: 14,
  toasts: true,
  defaultFolder: null,
  defaultShell: 'pwsh',
  tabs: [
    mkTab({ name: 'termhub', shell: 'pwsh', folder: 'C:\\workspace\\custom\\termhub', content: 'restored' }),
    mkTab({ name: 'api', shell: 'pwsh', folder: 'C:\\workspace\\api', status: 'working', claude: true, content: 'claude-working' }),
    mkTab({ name: 'web', shell: 'pwsh', folder: 'C:\\workspace\\web', status: 'waiting', claude: true, content: 'claude-waiting' }),
    mkTab({ name: 'Doku', custom: true, shell: 'pwsh', folder: 'C:\\workspace\\docs', status: 'paused', claude: true, content: 'claude-paused' }),
    mkTab({ name: 'infra', shell: 'gitbash', folder: 'C:\\workspace\\infra', status: 'processes', content: 'npm-dev' }),
    mkTab({ name: 'termhub 2', shell: 'pwsh', folder: 'C:\\workspace\\custom\\termhub', status: 'finished', claude: true, content: 'claude-finished' }),
    mkTab({ name: 'Ubuntu', shell: 'wsl:Ubuntu', folder: '\\\\wsl$\\Ubuntu\\home\\dev', content: 'wsl' }),
  ],
  activeId: null,
  closed: [],
  recent: ['C:\\workspace\\custom\\termhub', 'C:\\workspace\\api', 'C:\\workspace\\web', 'C:\\workspace\\infra', 'C:\\workspace\\docs', 'D:\\kunden\\acme-portal'],
  overflowDemo: false,
};
state.activeId = state.tabs[0].id;

const activeTab = () => state.tabs.find((t) => t.id === state.activeId);
const tabById = (id) => state.tabs.find((t) => t.id === id);
const basename = (p) => (p === HOME ? 'dev' : /^[A-Za-z]:\\?$/.test(p) ? p.slice(0, 2) : p.split('\\').filter(Boolean).pop());
const posix = (p) => p.replace(/^([A-Za-z]):/, (_, d) => `/${d.toLowerCase()}`).replace(/\\/g, '/');

function uniqueName(base) {
  const used = new Set(state.tabs.map((t) => t.name));
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) if (!used.has(`${base} ${n}`)) return `${base} ${n}`;
}

function rememberFolder(folder) {
  if (!folder || folder.startsWith('\\\\wsl')) return;
  state.recent = [folder, ...state.recent.filter((f) => f !== folder)].slice(0, 8);
}

let logTimer;
function log(msg) {
  const el = $('#proto-log');
  if (!el) return;
  el.textContent = msg;
  clearTimeout(logTimer);
  logTimer = setTimeout(() => (el.textContent = '–'), 6000);
}

// ---------- Nachgemachter Terminal-Inhalt ----------
const CUR = '\u0000';
const CURSOR = '<span class="cursor"></span>';
const span = (text, cls) => (cls ? `<span class="${cls}">${esc(text)}</span>` : esc(text));

function promptHtml(tab) {
  switch (tab.shell) {
    case 'gitbash':
      return `${span('dev@pc', 'a-green')} ${span('MINGW64', 'a-magenta')} ${span(posix(tab.folder), 'a-yellow')}\n$ `;
    case 'wsl:Ubuntu':
      return `${span('dev@pc', 'a-green')}:${span('~/projekte', 'a-blue')}$ `;
    case 'cmd':
      return `${esc(tab.folder)}&gt;`;
    default:
      return `${span('PS', 'a-dim')} ${esc(tab.folder)}${span('>', 'a-dim')} `;
  }
}

/** Rahmen aus Box-Zeichen, wie Claude Code ihn im Terminal zeichnet. */
function boxed(rows, width, cls) {
  const inner = width - 2;
  const out = [span(`╭${'─'.repeat(inner)}╮`, cls)];
  for (const row of rows) {
    const segs = typeof row === 'string' ? [[row]] : row;
    let len = 0;
    const html = segs
      .map(([t, c]) => {
        if (t === CUR) {
          len += 1;
          return CURSOR;
        }
        len += [...t].length;
        return span(t, c);
      })
      .join('');
    out.push(`${span('│', cls)} ${html}${' '.repeat(Math.max(0, inner - 1 - len))}${span('│', cls)}`);
  }
  out.push(span(`╰${'─'.repeat(inner)}╯`, cls));
  return out.join('\n');
}

const claudeInput = () => `${boxed([[['> '], [CUR]]], 64, 'a-dim')}\n${span('  ? für Tastenkürzel', 'a-dim')}`;

const PROMPTS = {
  api: 'Füge für /orders eine Paginierung hinzu und passe die Tests an',
  web: 'Baue den Schalter für das dunkle Design in die Navigation ein',
  'termhub 2': 'Schreib Tests für den Zustandsspeicher',
  Doku: 'Überarbeite das Kapitel zur Installation',
};

function claudeConversation(tab) {
  const ask = PROMPTS[tab.name] ?? 'Räum die Imports in src/ auf';
  return [
    `${promptHtml(tab)}claude`,
    '',
    `${span('✻', 'a-orange')} ${span('Claude Code', 'a-bold')} ${span(`· ${tab.folder}`, 'a-dim')}`,
    '',
    `${span('>', 'a-dim')} ${esc(ask)}`,
    '',
    `${span('●', 'a-white')} Ich schaue mir zuerst den bestehenden Code und die Tests an.`,
    '',
    `${span('●', 'a-green')} ${span('Read', 'a-bold')}(src/orders/controller.ts)`,
    `  ${span('⎿  142 Zeilen gelesen', 'a-dim')}`,
    '',
    `${span('●', 'a-green')} ${span('Update', 'a-bold')}(src/orders/controller.ts)`,
    `  ${span('⎿  18 Zeilen hinzugefügt, 3 entfernt', 'a-dim')}`,
    `     ${span('42', 'a-dim')} ${span('+  const page = Number(req.query.page ?? 1);', 'a-green')}`,
    `     ${span('43', 'a-dim')} ${span('+  const size = Math.min(Number(req.query.size ?? 20), 100);', 'a-green')}`,
    `     ${span('44', 'a-dim')} ${span('-  const rows = await repo.findAll();', 'a-red')}`,
    '',
    '',
  ].join('\n');
}

const CONTENT = {
  fresh: (t) => `${promptHtml(t)}${CURSOR}`,

  restored: (t) =>
    `<span class="restored">${promptHtml(t)}git status
On branch main
Changes not staged for commit:
  (use "git add &lt;file&gt;..." to update what will be committed)
        ${span('modified:   src/main/main.ts', 'a-red')}
        ${span('modified:   src/renderer/styles.css', 'a-red')}

${promptHtml(t)}npm run build

&gt; termhub@0.1.0 build
&gt; node build.mjs

  dist\\main\\main.js              ${span('42.1kb', 'a-cyan')}
  dist\\renderer\\renderer.js      ${span('318.4kb', 'a-cyan')}

${span('⚡ Done in 412ms', 'a-green')}
</span>${span('────────────── Wiederhergestellt · Mi., 19.11.2026, 08:12 ──────────────', 'a-dim')}

${promptHtml(t)}${CURSOR}`,

  'claude-working': (t) =>
    `${claudeConversation(t)}${span('✻', 'a-orange')} ${span('Denkt nach …', 'a-orange')} ${span('(14 s · esc zum Unterbrechen)', 'a-dim')}\n\n${claudeInput()}`,

  'claude-waiting': (t) =>
    `${claudeConversation(t)}${span('●', 'a-green')} ${span('Bash', 'a-bold')}(npm test -- --run src/nav)\n\n${boxed(
      [
        [['Bash-Befehl', 'a-bold']],
        '',
        '  npm test -- --run src/nav',
        [['  Tests für die Navigation ausführen', 'a-dim']],
        '',
        'Möchtest du fortfahren?',
        [['❯ 1. Ja', 'a-blue']],
        '  2. Ja, und für diesen Befehl nicht mehr fragen',
        '  3. Nein, und Claude sagen, was anders laufen soll (esc)',
      ],
      66,
      'a-orange',
    )}`,

  'claude-finished': (t) =>
    `${claudeConversation(t)}${span('●', 'a-white')} Fertig. Die Tests für den Zustandsspeicher sind geschrieben, alle 23 laufen durch.\n\n${claudeInput()}`,

  'claude-paused': (t) => `${promptHtml(t)}`,

  'claude-resumed': (t) =>
    `${claudeConversation(t)}${span('●', 'a-white')} Das Kapitel ist überarbeitet. Soll ich auch die Screenshots erneuern?\n\n${claudeInput()}`,

  'npm-dev': (t) =>
    `${promptHtml(t)}npm run dev

&gt; infra-dashboard@2.3.0 dev
&gt; vite

  ${span('VITE', 'a-green')} ${span('v6.2.1', 'a-green')}  ready in ${span('312', 'a-white')} ms

  ${span('➜', 'a-green')}  ${span('Local:', 'a-bold')}   ${span('http://localhost:5173/', 'a-cyan')}
  ${span('➜', 'a-green')}  ${span('Network: use --host to expose', 'a-dim')}
  ${span('➜', 'a-green')}  ${span('press h + enter to show help', 'a-dim')}
${span('08:14:02', 'a-dim')} ${span('[vite]', 'a-cyan')} ${span('hmr update', 'a-green')} /src/App.tsx
${span('08:16:47', 'a-dim')} ${span('[vite]', 'a-cyan')} ${span('hmr update', 'a-green')} /src/components/Chart.tsx
`,

  wsl: (t) => `${span('Welcome to Ubuntu 24.04.1 LTS (GNU/Linux 5.15.167.4-microsoft-standard-WSL2 x86_64)', 'a-dim')}\n\n${promptHtml(t)}${CURSOR}`,
};

function contentFor(tab) {
  if (tab.claude) {
    if (tab.status === 'working') return CONTENT['claude-working'](tab);
    if (tab.status === 'waiting') return CONTENT['claude-waiting'](tab);
    if (tab.status === 'finished') return CONTENT['claude-finished'](tab);
  }
  return (CONTENT[tab.content] ?? CONTENT.fresh)(tab);
}

// ---------- Darstellung ----------
const els = {
  win: $('#win'),
  strip: $('#tabstrip'),
  term: $('#term'),
  toasts: $('#toasts'),
  layer: $('#layer'),
};

function resolvedTheme() {
  if (state.theme !== 'system') return state.theme;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme() {
  document.documentElement.dataset.theme = resolvedTheme();
  document.documentElement.dataset.accent = state.accent;
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  applyTheme();
  renderProto();
});

let renaming = null;

function renderTabs() {
  const scroll = els.strip.scrollLeft;
  els.strip.replaceChildren(...state.tabs.map(renderTab));
  els.strip.scrollLeft = scroll;
  updateFades();
}

function renderTab(tab) {
  const el = document.createElement('div');
  el.className = 'tab' + (tab.id === state.activeId ? ' active' : '');
  el.setAttribute('role', 'tab');
  el.setAttribute('aria-selected', String(tab.id === state.activeId));
  el.dataset.id = tab.id;
  el.draggable = renaming !== tab.id;

  if (renaming === tab.id) {
    el.classList.add('renaming');
    el.innerHTML = `${tabIcon(tab)}<input class="tab-rename" value="${esc(tab.name)}" spellcheck="false" />`;
    const input = $('input', el);
    queueMicrotask(() => {
      input.focus();
      input.select();
    });
    let done = false;
    const finish = (commit) => {
      if (done) return;
      done = true;
      const v = input.value.trim();
      if (commit && v && v !== tab.name) {
        tab.name = v;
        tab.custom = true;
      }
      renaming = null;
      renderTabs();
      els.term.focus();
    };
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') finish(true);
      if (e.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true));
    return el;
  }

  el.innerHTML = `${tabIcon(tab)}<span class="tab-name">${esc(tab.name)}</span><button class="tab-close" aria-label="Tab schliessen">${icon('x')}</button>`;
  $('.tab-close', el).addEventListener('click', (e) => {
    e.stopPropagation();
    requestClose([tab.id]);
  });
  el.addEventListener('mousedown', (e) => {
    if (e.button === 1) {
      e.preventDefault();
      requestClose([tab.id]);
    }
  });
  el.addEventListener('click', () => activate(tab.id));
  el.addEventListener('dblclick', (e) => {
    if (!e.target.closest('.tab-close')) startRename(tab.id);
  });
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    hideTip();
    openTabMenu(tab, e.clientX, e.clientY);
  });
  el.addEventListener('mouseenter', () => scheduleTip(el, () => tabTipHtml(tab)));
  el.addEventListener('mouseleave', hideTip);
  attachDrag(el, tab);
  return el;
}

function tabTipHtml(tab) {
  return `<b>${esc(tab.name)}</b><dl><dt>Ordner</dt><dd class="mono">${esc(tab.folder)}</dd><dt>Shell</dt><dd>${esc(shellLabel(tab.shell))}</dd><dt>Status</dt><dd>${esc(STATUS_TEXT[tab.status])}</dd></dl>`;
}

function updateFades() {
  const s = els.strip;
  s.classList.toggle('fade-l', s.scrollLeft > 2);
  s.classList.toggle('fade-r', s.scrollLeft + s.clientWidth < s.scrollWidth - 2);
}
els.strip.addEventListener('scroll', updateFades);
els.strip.addEventListener(
  'wheel',
  (e) => {
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      els.strip.scrollLeft += e.deltaY;
      e.preventDefault();
    }
  },
  { passive: false },
);
new ResizeObserver(updateFades).observe(els.strip);

function renderTerminal() {
  const tab = activeTab();
  els.term.style.setProperty('--fs', `${state.fontSize}px`);
  els.term.innerHTML = tab ? contentFor(tab) : '';
  els.term.scrollTop = els.term.scrollHeight;
}

function renderAll() {
  renderTabs();
  renderTerminal();
  renderProto();
}

// ---------- Tabs: Aktionen ----------
function activate(id) {
  const tab = tabById(id);
  if (!tab) return;
  state.activeId = id;
  if (tab.status === 'finished') tab.status = 'idle';
  if (tab.status === 'paused') {
    tab.status = 'idle';
    tab.content = 'claude-resumed';
    log(`Startbefehl: claude --resume <Kennung> in ${tab.folder}`);
  }
  dismissToastsFor(id);
  renderTabs();
  renderTerminal();
  renderProto();
  const el = els.strip.querySelector(`[data-id="${id}"]`);
  el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  els.term.focus();
}

function newTab({ folder, shell } = {}) {
  const f = folder ?? state.defaultFolder ?? HOME;
  const tab = mkTab({ name: uniqueName(basename(f)), shell: shell ?? state.defaultShell, folder: f });
  if (tab.shell.startsWith('wsl')) {
    tab.content = 'wsl';
    tab.name = uniqueName('Ubuntu');
  }
  const i = state.tabs.findIndex((t) => t.id === state.activeId);
  state.tabs.splice(i + 1, 0, tab);
  rememberFolder(f);
  activate(tab.id);
}

function duplicateTab(tab) {
  newTab({ folder: tab.folder, shell: tab.shell });
}

function requestClose(ids) {
  const tabs = ids.map(tabById).filter(Boolean);
  const busy = tabs.filter((t) => BUSY.has(t.status));
  if (busy.length === 0) return closeTabs(ids);
  confirmClose(tabs, busy, () => closeTabs(ids));
}

function closeTabs(ids) {
  for (const id of ids) {
    const i = state.tabs.findIndex((t) => t.id === id);
    if (i < 0) continue;
    const [tab] = state.tabs.splice(i, 1);
    state.closed.unshift({ tab, index: i });
    state.closed = state.closed.slice(0, 10);
    rememberFolder(tab.folder);
    dismissToastsFor(id);
    if (state.activeId === id) {
      const next = state.tabs[Math.min(i, state.tabs.length - 1)];
      state.activeId = next?.id ?? null;
    }
  }
  if (state.tabs.length === 0) newTab();
  else activate(state.activeId);
}

function reopenClosed(entry = state.closed[0]) {
  if (!entry) return log('Keine geschlossenen Tabs.');
  state.closed = state.closed.filter((e) => e !== entry);
  const { tab, index } = entry;
  if (tab.claude) {
    tab.status = 'idle';
    tab.content = 'claude-resumed';
    log(`Wieder geöffnet, Startbefehl: claude --resume <Kennung>`);
  } else if (tab.content === 'fresh' || tab.content === 'npm-dev') {
    tab.status = 'idle';
    tab.content = 'restored';
  }
  state.tabs.splice(clamp(index, 0, state.tabs.length), 0, tab);
  activate(tab.id);
}

function startRename(id) {
  hideTip();
  renaming = id;
  renderTabs();
}

function moveTab(id, toIndex) {
  const from = state.tabs.findIndex((t) => t.id === id);
  if (from < 0) return;
  const [tab] = state.tabs.splice(from, 1);
  state.tabs.splice(toIndex > from ? toIndex - 1 : toIndex, 0, tab);
  renderTabs();
}

function cycle(offset) {
  const i = state.tabs.findIndex((t) => t.id === state.activeId);
  const n = state.tabs.length;
  activate(state.tabs[(i + offset + n) % n].id);
}

// ---------- Ziehen zum Umsortieren ----------
let dragId = null;
let dropMark = null;

function attachDrag(el, tab) {
  el.addEventListener('dragstart', (e) => {
    dragId = tab.id;
    hideTip();
    el.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', tab.id);
  });
  el.addEventListener('dragend', () => {
    dragId = null;
    el.classList.remove('dragging');
    dropMark?.remove();
    dropMark = null;
  });
}

function dropIndex(clientX) {
  const tabs = [...els.strip.querySelectorAll('.tab')];
  for (let i = 0; i < tabs.length; i++) {
    const r = tabs[i].getBoundingClientRect();
    if (clientX < r.left + r.width / 2) return i;
  }
  return tabs.length;
}

els.strip.addEventListener('dragover', (e) => {
  if (!dragId) return;
  e.preventDefault();
  const idx = dropIndex(e.clientX);
  const tabs = [...els.strip.querySelectorAll('.tab')];
  const ref = tabs[idx] ?? tabs[tabs.length - 1];
  const stripRect = els.strip.getBoundingClientRect();
  const r = ref.getBoundingClientRect();
  const x = (tabs[idx] ? r.left : r.right + 2) - stripRect.left + els.strip.scrollLeft - 1;
  if (!dropMark) {
    dropMark = document.createElement('div');
    dropMark.className = 'drop-mark';
    els.strip.appendChild(dropMark);
  }
  dropMark.style.left = `${x}px`;
});
els.strip.addEventListener('drop', (e) => {
  if (!dragId) return;
  e.preventDefault();
  moveTab(dragId, dropIndex(e.clientX));
});

// ---------- Tooltip ----------
let tipTimer = null;
let tipEl = null;

function scheduleTip(anchor, html) {
  clearTimeout(tipTimer);
  tipTimer = setTimeout(() => showTip(anchor, typeof html === 'function' ? html() : html), 550);
}

function showTip(anchor, html) {
  hideTip();
  if (dragId || renaming || els.layer.querySelector('.menu, .overlay')) return;
  tipEl = document.createElement('div');
  tipEl.className = 'tip';
  tipEl.innerHTML = html;
  els.layer.appendChild(tipEl);
  const win = els.win.getBoundingClientRect();
  const r = anchor.getBoundingClientRect();
  const w = tipEl.offsetWidth;
  tipEl.style.left = `${clamp(r.left - win.left, 8, win.width - w - 8)}px`;
  tipEl.style.top = `${r.bottom - win.top + 6}px`;
}

function hideTip() {
  clearTimeout(tipTimer);
  tipEl?.remove();
  tipEl = null;
}

function bindTip(el) {
  el.addEventListener('mouseenter', () => scheduleTip(el, esc(el.dataset.tip)));
  el.addEventListener('mouseleave', hideTip);
  el.addEventListener('mousedown', hideTip);
}

// ---------- Menüs ----------
let openMenuState = null;

function closeMenu() {
  if (!openMenuState) return;
  openMenuState.el.remove();
  openMenuState.anchor?.classList.remove('open');
  openMenuState = null;
}

/** Öffnet ein Menü. items: {label, sub, icon, kbd, badge, danger, run} | 'sep' | {header}. */
function openMenu(items, { x, y, anchor, align = 'left' }) {
  closeMenu();
  hideTip();
  const el = document.createElement('div');
  el.className = 'menu';
  el.setAttribute('role', 'menu');
  const buttons = [];
  for (const item of items) {
    if (item === 'sep') {
      el.insertAdjacentHTML('beforeend', '<div class="menu-sep"></div>');
      continue;
    }
    if (item.header) {
      el.insertAdjacentHTML('beforeend', `<div class="menu-h">${esc(item.header)}</div>`);
      continue;
    }
    const b = document.createElement('button');
    b.className = 'mi' + (item.danger ? ' danger' : '');
    b.setAttribute('role', 'menuitem');
    b.innerHTML = `<span class="mi-ic">${item.icon ? icon(item.icon) : ''}</span><span class="mi-label">${esc(item.label)}${
      item.sub ? `<small>${esc(item.sub)}</small>` : ''
    }</span>${item.badge ? `<span class="mi-badge">${esc(item.badge)}</span>` : ''}${item.kbd ? `<span class="mi-kbd">${esc(item.kbd)}</span>` : ''}`;
    b.addEventListener('click', () => {
      closeMenu();
      item.run?.();
    });
    b.addEventListener('mousemove', () => setFocus(buttons.indexOf(b)));
    buttons.push(b);
    el.appendChild(b);
  }
  els.layer.appendChild(el);

  const win = els.win.getBoundingClientRect();
  let left = x - win.left;
  if (align === 'right') left -= el.offsetWidth;
  el.style.left = `${clamp(left, 6, win.width - el.offsetWidth - 6)}px`;
  el.style.top = `${clamp(y - win.top, 6, win.height - el.offsetHeight - 6)}px`;

  let focus = -1;
  function setFocus(i) {
    focus = i;
    buttons.forEach((btn, j) => btn.classList.toggle('focus', j === i));
  }
  anchor?.classList.add('open');
  openMenuState = {
    el,
    anchor,
    key(e) {
      if (e.key === 'ArrowDown') setFocus((focus + 1) % buttons.length);
      else if (e.key === 'ArrowUp') setFocus((focus - 1 + buttons.length) % buttons.length);
      else if (e.key === 'Enter' && focus >= 0) buttons[focus].click();
      else if (e.key === 'Escape') closeMenu();
      else return false;
      return true;
    },
  };
}

document.addEventListener('mousedown', (e) => {
  if (openMenuState && !openMenuState.el.contains(e.target) && !openMenuState.anchor?.contains(e.target)) closeMenu();
});

function openNewMenu() {
  const btn = $('#btn-newmenu');
  if (openMenuState?.anchor === btn) return closeMenu();
  const r = btn.getBoundingClientRect();
  const items = [
    { header: 'Shell' },
    ...SHELLS.map((s) => ({
      label: s.label,
      icon: 'terminal',
      badge: s.id === state.defaultShell ? 'Standard' : undefined,
      run: () => newTab({ shell: s.id }),
    })),
    'sep',
    { header: 'Neues Terminal in …' },
    ...state.recent.slice(0, 8).map((f) => ({ label: basename(f), sub: f, icon: 'folder', run: () => newTab({ folder: f }) })),
    { label: 'Ordner wählen …', icon: 'folderPlus', run: pickFolderForNewTab },
  ];
  openMenu(items, { x: r.left, y: r.bottom + 4, anchor: btn });
}

function openTabMenu(tab, x, y) {
  openMenu(
    [
      { label: 'Umbenennen', icon: 'pencil', kbd: 'F2', run: () => startRename(tab.id) },
      { label: 'Duplizieren', icon: 'duplicate', run: () => duplicateTab(tab) },
      'sep',
      { label: 'Ordner im Explorer öffnen', icon: 'folderOpen', run: () => log(`Explorer öffnet: ${tab.folder}`) },
      { label: 'Pfad kopieren', icon: 'copy', run: () => copyPath(tab) },
      'sep',
      { label: 'Schliessen', icon: 'x', kbd: 'Ctrl+Shift+W', run: () => requestClose([tab.id]) },
      {
        label: 'Andere Tabs schliessen',
        icon: 'closeOthers',
        run: () => requestClose(state.tabs.filter((t) => t.id !== tab.id).map((t) => t.id)),
      },
    ],
    { x, y },
  );
}

function copyPath(tab) {
  navigator.clipboard?.writeText(tab.folder).catch(() => {});
  log(`In die Zwischenablage kopiert: ${tab.folder}`);
}

const FAKE_FOLDERS = ['D:\\kunden\\acme-portal', 'C:\\workspace\\custom', 'C:\\workspace\\playground\\rust-cli'];
let fakeFolderIdx = 0;
function fakePick() {
  const f = FAKE_FOLDERS[fakeFolderIdx % FAKE_FOLDERS.length];
  fakeFolderIdx++;
  return f;
}

/**
 * Öffnet den Ordner-Dialog von Windows (Explorer). Im Browser liefert er nur den Ordnernamen,
 * nicht den ganzen Pfad; die App bekommt den vollen Pfad. Gibt null zurück, wenn abgebrochen wurde.
 */
async function pickFolder() {
  if (window.showDirectoryPicker) {
    try {
      const handle = await window.showDirectoryPicker({ id: 'termhub', mode: 'read' });
      log(`Ordner-Dialog: „${handle.name}“ gewählt (im Browser ist nur der Name sichtbar).`);
      return `…\\${handle.name}`;
    } catch (err) {
      if (err && err.name === 'AbortError') return null;
    }
  }
  const f = fakePick();
  log(`(Ordner-Dialog nicht verfügbar) Beispiel gewählt: ${f}`);
  return f;
}

async function pickFolderForNewTab() {
  const f = await pickFolder();
  if (f) newTab({ folder: f });
}

// ---------- Overlays: Dialoge und Palette ----------
let overlayState = null;

function openOverlay(contentEl, { onKey, onClose, top = false } = {}) {
  closeOverlay();
  closeMenu();
  hideTip();
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.appendChild(contentEl);
  ov.addEventListener('mousedown', (e) => {
    if (e.target === ov) closeOverlay();
  });
  els.layer.appendChild(ov);
  overlayState = { el: ov, onKey, onClose, top };
}

function closeOverlay() {
  if (!overlayState) return;
  const { el, onClose } = overlayState;
  overlayState = null;
  el.remove();
  onClose?.();
  els.term.focus();
}

function dialog({ title, body, actions, wide }) {
  const d = document.createElement('div');
  d.className = 'dialog' + (wide ? ' wide' : '');
  d.setAttribute('role', 'dialog');
  d.innerHTML = `<div class="dlg-head">${esc(title)}</div><div class="dlg-body"></div><div class="dlg-actions"></div>`;
  const bodyEl = $('.dlg-body', d);
  if (typeof body === 'string') bodyEl.innerHTML = body;
  else bodyEl.appendChild(body);
  const actionsEl = $('.dlg-actions', d);
  let defaultBtn = null;
  for (const a of actions) {
    const b = document.createElement('button');
    b.className = `btn ${a.kind ?? ''}`;
    b.textContent = a.label;
    b.addEventListener('click', () => {
      closeOverlay();
      a.run?.();
    });
    actionsEl.appendChild(b);
    if (a.autofocus) defaultBtn = b;
  }
  openOverlay(d, {
    onKey(e) {
      if (e.key === 'Escape') {
        closeOverlay();
        return true;
      }
      return false;
    },
  });
  (defaultBtn ?? actionsEl.lastElementChild)?.focus();
}

function busyReason(t) {
  if (t.status === 'working') return 'Claude arbeitet gerade. Die laufende Antwort wird abgebrochen.';
  if (t.status === 'waiting') return 'Claude wartet auf deine Antwort.';
  return 'Es läuft noch ein Programm (npm run dev).';
}

function confirmClose(tabs, busy, onConfirm) {
  if (tabs.length === 1) {
    const t = busy[0];
    dialog({
      title: `„${t.name}“ schliessen?`,
      body: `<p>${esc(busyReason(t))}</p><p class="hint">Mit <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> öffnest du den Tab wieder${
        t.claude ? ', die Claude-Session wird dann fortgesetzt' : ''
      }.</p>`,
      actions: [
        { label: 'Abbrechen', autofocus: true },
        { label: 'Schliessen', kind: 'danger', run: onConfirm },
      ],
    });
    return;
  }
  dialog({
    title: `${tabs.length} Tabs schliessen?`,
    body: `<p>In ${busy.length === 1 ? 'diesem Tab' : 'diesen Tabs'} läuft noch etwas:</p><ul>${busy
      .map((t) => `<li><b>${esc(t.name)}</b>: ${esc(STATUS_TEXT[t.status])}</li>`)
      .join('')}</ul><p class="hint">Geschlossene Tabs öffnest du mit <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> wieder.</p>`,
    actions: [
      { label: 'Abbrechen', autofocus: true },
      { label: `${tabs.length} Tabs schliessen`, kind: 'danger', run: onConfirm },
    ],
  });
}

// ---------- Einstellungen ----------
function openSettings() {
  const body = document.createElement('div');
  const render = () => {
    const folder = state.defaultFolder;
    body.innerHTML = `
      <div class="set-section">
        <h4>Allgemein</h4>
        <div class="set-row">
          <div><div class="set-label">Standardordner</div><div class="set-desc">Hier starten neue Terminals.</div></div>
          <div class="set-ctl">
            <span class="path-box ${folder ? '' : 'placeholder'}" title="${esc(folder ?? HOME)}">${esc(folder ?? 'Benutzerordner')}</span>
            <button class="btn sm" data-act="pick">Ändern …</button>
            ${folder ? '<button class="btn sm" data-act="reset">Zurücksetzen</button>' : ''}
          </div>
        </div>
        <div class="set-row">
          <div><div class="set-label">Standard-Shell</div><div class="set-desc">Für <kbd>+</kbd> und <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>T</kbd>.</div></div>
          <div class="set-ctl"><select class="select" data-act="shell">${SHELLS.map(
            (s) => `<option value="${s.id}" ${s.id === state.defaultShell ? 'selected' : ''}>${esc(s.label)}</option>`,
          ).join('')}</select></div>
        </div>
      </div>
      <div class="set-section">
        <h4>Darstellung</h4>
        <div class="set-row">
          <div><div class="set-label">Design</div><div class="set-desc">„System“ folgt der Einstellung von Windows.</div></div>
          <div class="set-ctl"><div class="seg" data-act="theme">${['system', 'light', 'dark']
            .map((v) => `<button data-v="${v}" class="${state.theme === v ? 'on' : ''}">${{ system: 'System', light: 'Hell', dark: 'Dunkel' }[v]}</button>`)
            .join('')}</div></div>
        </div>
        <div class="set-row">
          <div><div class="set-label">Schriftgrösse im Terminal</div><div class="set-desc">Auch mit <kbd>Ctrl</kbd> + Mausrad.</div></div>
          <div class="set-ctl"><div class="stepper"><button data-act="font-" aria-label="Kleiner">−</button><span>${state.fontSize}</span><button data-act="font+" aria-label="Grösser">+</button></div></div>
        </div>
      </div>
      <div class="set-section">
        <h4>Hinweise</h4>
        <div class="set-row">
          <div><div class="set-label">Hinweise im Fenster</div><div class="set-desc">Meldet, wenn Claude in einem anderen Tab wartet oder fertig ist.</div></div>
          <div class="set-ctl"><button class="switch ${state.toasts ? 'on' : ''}" data-act="toasts" role="switch" aria-checked="${state.toasts}" aria-label="Hinweise im Fenster"></button></div>
        </div>
      </div>`;
  };
  render();
  body.addEventListener('click', (e) => {
    const t = e.target.closest('[data-act], [data-v]');
    if (!t) return;
    const act = t.dataset.act ?? t.parentElement.dataset.act;
    if (act === 'pick') {
      pickFolder().then((f) => {
        if (!f) return;
        state.defaultFolder = f;
        render();
        renderProto();
      });
      return;
    }
    if (act === 'reset') state.defaultFolder = null;
    if (act === 'theme') {
      state.theme = t.dataset.v;
      applyTheme();
    }
    if (act === 'font-' || act === 'font+') setFontSize(state.fontSize + (act === 'font+' ? 1 : -1));
    if (act === 'toasts') state.toasts = !state.toasts;
    render();
    renderProto();
  });
  body.addEventListener('change', (e) => {
    if (e.target.dataset.act === 'shell') {
      state.defaultShell = e.target.value;
      renderProto();
    }
  });
  dialog({ title: 'Einstellungen', body, wide: true, actions: [{ label: 'Fertig', kind: 'primary', autofocus: true }] });
}

function setFontSize(v) {
  state.fontSize = clamp(v, 8, 32);
  renderTerminal();
}

// ---------- Befehlspalette ----------
function fuzzy(query, text) {
  const q = query.toLowerCase().replace(/\s+/g, '');
  const s = text.toLowerCase();
  if (!q) return 1;
  let from = 0;
  let prev = -2;
  let score = 0;
  for (const ch of q) {
    const i = s.indexOf(ch, from);
    if (i < 0) return 0;
    score += (i === prev + 1 ? 3 : 1) + (i === 0 || /[\s\-_\\/.]/.test(s[i - 1]) ? 2 : 0);
    prev = i;
    from = i + 1;
  }
  return score - s.length * 0.02;
}

function paletteEntries(mode) {
  if (mode === 'folders') {
    return [
      {
        group: 'Neues Terminal in …',
        items: [
          ...state.recent.map((f) => ({ icon: 'folder', label: basename(f), sub: f, run: () => newTab({ folder: f }) })),
          { icon: 'folderPlus', label: 'Ordner wählen …', run: pickFolderForNewTab },
        ],
      },
    ];
  }
  if (mode === 'closed') {
    return [
      {
        group: 'Zuletzt geschlossen',
        items: state.closed.map((e) => ({ tab: { ...e.tab, status: 'idle' }, label: e.tab.name, sub: e.tab.folder, run: () => reopenClosed(e) })),
      },
    ];
  }
  const t = activeTab();
  return [
    {
      group: 'Tabs',
      items: state.tabs.map((tab) => ({ tab, label: tab.name, sub: tab.folder, isTab: true, run: () => activate(tab.id) })),
    },
    {
      group: 'Befehle',
      items: [
        { icon: 'plus', label: 'Neues Terminal', kbd: 'Ctrl+Shift+T', run: () => newTab() },
        { icon: 'folder', label: 'Neues Terminal in …', mode: 'folders' },
        { icon: 'pencil', label: 'Tab umbenennen', kbd: 'F2', run: () => t && startRename(t.id) },
        { icon: 'x', label: 'Tab schliessen', kbd: 'Ctrl+Shift+W', run: () => t && requestClose([t.id]) },
        { icon: 'closeOthers', label: 'Andere Tabs schliessen', run: () => t && requestClose(state.tabs.filter((x) => x.id !== t.id).map((x) => x.id)) },
        { icon: 'history', label: 'Zuletzt geschlossen …', kbd: 'Ctrl+Shift+Z', mode: 'closed' },
        { icon: 'sliders', label: 'Einstellungen', run: openSettings },
        { icon: 'folderOpen', label: 'Standardordner ändern', run: openSettings },
      ],
    },
  ];
}

function openPalette(initialMode = 'root') {
  let mode = initialMode;
  let sel = 0;
  let flat = [];
  const el = document.createElement('div');
  el.className = 'palette';
  el.innerHTML = `
    <div class="pal-input">${icon('search')}<span class="pal-crumb" hidden></span><input placeholder="Tab oder Befehl suchen …" spellcheck="false" /></div>
    <div class="pal-list"></div>
    <div class="pal-foot"><span><kbd>↑</kbd> <kbd>↓</kbd> auswählen</span><span><kbd>Enter</kbd> ausführen</span><span><kbd>Esc</kbd> schliessen</span></div>`;
  const input = $('input', el);
  const list = $('.pal-list', el);
  const crumb = $('.pal-crumb', el);

  function render() {
    const q = input.value.trim();
    crumb.hidden = mode === 'root';
    crumb.textContent = mode === 'folders' ? 'Neues Terminal in' : 'Zuletzt geschlossen';
    input.placeholder = mode === 'root' ? 'Tab oder Befehl suchen …' : 'Filtern …';
    flat = [];
    const parts = [];
    for (const g of paletteEntries(mode)) {
      const items = g.items
        .map((it) => ({ it, s: fuzzy(q, `${it.label} ${it.sub ?? ''}`) + (it.isTab ? 0.5 : 0) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => (q ? b.s - a.s : 0));
      if (!items.length) continue;
      parts.push(`<div class="pal-group">${esc(g.group)}</div>`);
      for (const { it } of items) {
        const i = flat.push(it) - 1;
        const lead = `<span class="mi-ic">${it.tab ? tabIcon(it.tab) : icon(it.icon)}</span>`;
        parts.push(
          `<div class="pal-item ${i === sel ? 'sel' : ''}" data-i="${i}">${lead}<span class="pal-main">${esc(it.label)}${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</span>${
            it.kbd ? `<span class="mi-kbd">${esc(it.kbd)}</span>` : it.mode ? `<span class="mi-kbd">›</span>` : ''
          }</div>`,
        );
      }
    }
    list.innerHTML = parts.join('') || '<div class="pal-empty">Nichts gefunden</div>';
    list.querySelector('.sel')?.scrollIntoView({ block: 'nearest' });
  }

  function run(item) {
    if (!item) return;
    if (item.mode) {
      mode = item.mode;
      input.value = '';
      sel = 0;
      render();
      return;
    }
    closeOverlay();
    item.run?.();
  }

  input.addEventListener('input', () => {
    sel = 0;
    render();
  });
  list.addEventListener('mousemove', (e) => {
    const row = e.target.closest('.pal-item');
    if (row && Number(row.dataset.i) !== sel) {
      sel = Number(row.dataset.i);
      list.querySelectorAll('.pal-item').forEach((r) => r.classList.toggle('sel', Number(r.dataset.i) === sel));
    }
  });
  list.addEventListener('click', (e) => {
    const row = e.target.closest('.pal-item');
    if (row) run(flat[Number(row.dataset.i)]);
  });

  openOverlay(el, {
    onKey(e) {
      if (e.key === 'Escape') {
        if (mode !== 'root') {
          mode = 'root';
          input.value = '';
          sel = 0;
          render();
        } else closeOverlay();
        return true;
      }
      if (e.key === 'ArrowDown') sel = Math.min(sel + 1, flat.length - 1);
      else if (e.key === 'ArrowUp') sel = Math.max(sel - 1, 0);
      else if (e.key === 'Enter') return run(flat[sel]), true;
      else if (e.key === 'Backspace' && !input.value && mode !== 'root') mode = 'root';
      else return false;
      render();
      return true;
    },
  });
  render();
  input.focus();
}

// ---------- Hinweise ----------
const toastMap = new Map();

function demoToastTarget() {
  const candidates = state.tabs.filter((x) => x.id !== state.activeId && !toastMap.has(x.id) && !x.demo);
  return candidates.find((x) => x.claude) ?? candidates[0] ?? null;
}

function fireDemoToast(tab, kind) {
  tab.claude = true;
  tab.status = kind;
  renderTabs();
  pushToast(tab, kind);
}

function pushToast(tab, kind) {
  if (!state.toasts) return log('Hinweise sind in den Einstellungen abgeschaltet.');
  if (tab.id === state.activeId && document.hasFocus()) return log('Kein Hinweis: Der Tab ist gerade sichtbar.');
  dismissToastsFor(tab.id, true);
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `${statusHtml(kind === 'waiting' ? 'waiting' : 'finished')}<div class="t-body"><div class="t-title">${esc(tab.name)}</div><div class="t-msg">${
    kind === 'waiting' ? 'Claude wartet auf deine Bestätigung.' : 'Claude ist fertig.'
  }</div><div class="t-actions"><button class="btn sm primary">Öffnen</button></div></div><button class="t-close" aria-label="Hinweis schliessen">${icon('x')}</button>${
    kind === 'finished' ? '<div class="t-progress"></div>' : ''
  }`;
  $('.btn', el).addEventListener('click', () => activate(tab.id));
  $('.t-close', el).addEventListener('click', () => removeToast(tab.id));
  els.toasts.prepend(el);

  const entry = { el, kind, left: 6000, hover: false, last: performance.now() };
  el.addEventListener('mouseenter', () => (entry.hover = true));
  el.addEventListener('mouseleave', () => (entry.hover = false));
  toastMap.set(tab.id, entry);
  if (kind === 'finished') tickToast(tab.id);
}

function tickToast(id) {
  const entry = toastMap.get(id);
  if (!entry) return;
  const now = performance.now();
  const dt = now - entry.last;
  entry.last = now;
  // Countdown läuft nur, solange das Fenster im Vordergrund ist.
  if (!document.hidden && document.hasFocus() && !entry.hover) entry.left -= dt;
  entry.el.style.setProperty('--p', String(clamp(entry.left / 6000, 0, 1)));
  if (entry.left <= 0) return removeToast(id);
  requestAnimationFrame(() => tickToast(id));
}

function removeToast(id, instant = false) {
  const entry = toastMap.get(id);
  if (!entry) return;
  toastMap.delete(id);
  if (instant) return entry.el.remove();
  entry.el.classList.add('out');
  entry.el.addEventListener('animationend', () => entry.el.remove(), { once: true });
}

function dismissToastsFor(id, instant) {
  removeToast(id, instant);
}

// ---------- Fenster ----------
function setupChrome() {
  $('#btn-new').innerHTML = icon('plus');
  $('#btn-newmenu').innerHTML = icon('chevron');
  $('#btn-settings').innerHTML = icon('gear');
  $('#wc-min').innerHTML = WC_ICONS.min;
  $('#wc-close').innerHTML = WC_ICONS.close;
  updateMaxIcon();

  $('#btn-new').addEventListener('click', () => newTab());
  $('#btn-newmenu').addEventListener('click', openNewMenu);
  $('#btn-settings').addEventListener('click', openSettings);
  $('#wc-min').addEventListener('click', () => log('Minimieren (im Prototyp ohne Funktion)'));
  $('#wc-max').addEventListener('click', toggleMax);
  $('#wc-close').addEventListener('click', () => log('Schliessen: TermHub sichert alles und beendet sich ohne Rückfrage.'));
  $('#drag-space').addEventListener('dblclick', toggleMax);
  document.querySelectorAll('[data-tip]').forEach(bindTip);
}

function toggleMax() {
  document.body.classList.toggle('maximized');
  updateMaxIcon();
  renderProto();
}

function updateMaxIcon() {
  $('#wc-max').innerHTML = document.body.classList.contains('maximized') ? WC_ICONS.restore : WC_ICONS.max;
}

// ---------- Tastatur ----------
window.addEventListener(
  'keydown',
  (e) => {
    if (openMenuState?.key(e)) return e.preventDefault();
    if (overlayState) {
      if (overlayState.onKey?.(e)) e.preventDefault();
      return;
    }
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;

    const combo = `${e.ctrlKey ? 'Ctrl+' : ''}${e.shiftKey ? 'Shift+' : ''}${e.key.length === 1 ? e.key.toUpperCase() : e.key}`;
    const t = activeTab();
    const actions = {
      'Ctrl+Shift+P': () => openPalette(),
      'Ctrl+Shift+T': () => newTab(),
      'Ctrl+Shift+W': () => t && requestClose([t.id]),
      'Ctrl+Shift+Z': () => reopenClosed(),
      F2: () => t && startRename(t.id),
      'Ctrl+Tab': () => cycle(1),
      'Ctrl+Shift+Tab': () => cycle(-1),
      'Ctrl+PageDown': () => cycle(1),
      'Ctrl+PageUp': () => cycle(-1),
      'Ctrl+0': () => setFontSize(14),
    };
    // Schriftgrösse über das erzeugte Zeichen (Schweizer Tastatur: + liegt auf Shift+1).
    if (e.ctrlKey && (e.key === '+' || e.key === '=')) actions[combo] = () => setFontSize(state.fontSize + 1);
    if (e.ctrlKey && e.key === '-') actions[combo] = () => setFontSize(state.fontSize - 1);
    const digit = e.ctrlKey && !e.shiftKey && /^[1-9]$/.test(e.key) ? Number(e.key) : 0;
    if (digit) actions[combo] = () => state.tabs[digit - 1] && activate(state.tabs[digit - 1].id);

    const run = actions[combo];
    if (run) {
      e.preventDefault();
      e.stopPropagation();
      run();
    }
  },
  true,
);

els.term.addEventListener(
  'wheel',
  (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    setFontSize(state.fontSize + (e.deltaY < 0 ? 1 : -1));
  },
  { passive: false },
);

// ---------- Steuerleiste des Prototyps ----------
const DEMO_NAMES = ['billing', 'auth-service', 'mobile', 'design-system', 'analytics', 'search', 'notifications', 'gateway', 'scheduler', 'reports', 'cms', 'k8s', 'e2e-tests', 'playground'];

function renderProto() {
  const body = $('#proto-body');
  const t = activeTab();
  const b = document.body.classList;
  const chip = (label, on, act, v = '') => `<button class="pc ${on ? 'on' : ''}" data-act="${act}" data-v="${v}">${label}</button>`;
  body.innerHTML = `
    <h5>Design</h5>
    <div class="proto-row">${chip('System', state.theme === 'system', 'theme', 'system')}${chip('Hell', state.theme === 'light', 'theme', 'light')}${chip(
      'Dunkel',
      state.theme === 'dark',
      'theme',
      'dark',
    )}</div>
    <h5>Fenster</h5>
    <div class="proto-row">${chip('Terminal als Karte', !b.contains('edge'), 'edge')}${chip(
      'Maximiert',
      b.contains('maximized'),
      'max',
    )}${chip('Zieh-Fläche zeigen', b.contains('show-drag'), 'drag')}</div>
    <h5>Status des aktiven Tabs${t ? ` („${esc(t.name)}“)` : ''}</h5>
    <div class="proto-row">${['idle', 'working', 'waiting', 'processes', 'finished', 'paused']
      .map((s) => chip({ idle: 'Ruht', working: 'Arbeitet', waiting: 'Wartet', processes: 'Prozesse', finished: 'Fertig', paused: 'Pausiert' }[s], t?.status === s, 'status', s))
      .join('')}</div>
    <h5>Hinweise auslösen (für einen Hintergrund-Tab)</h5>
    <div class="proto-row">${chip('Claude fertig', false, 'toast', 'finished')}${chip('Claude wartet', false, 'toast', 'waiting')}${chip('Zwei Tabs zugleich', false, 'toast2')}</div>
    <h5>Dialoge und Ansichten</h5>
    <div class="proto-row">${chip('Befehlspalette', false, 'palette')}${chip('Einstellungen', false, 'settings')}${chip('Rückfrage', false, 'confirm')}${chip(
      'Rückfrage (mehrere)',
      false,
      'confirm-multi',
    )}${chip('Viele Tabs', state.overflowDemo, 'overflow')}</div>
    <div class="proto-note">Im Browser sind <kbd>Ctrl+Shift+T/W</kbd>, <kbd>Ctrl+Tab</kbd> und <kbd>Ctrl+1–9</kbd> reserviert. Dafür gibt es die Knöpfe und die Befehlspalette (<kbd>Ctrl+Shift+P</kbd>). Doppelklick bzw. <kbd>F2</kbd> benennt um, Rechtsklick öffnet das Tab-Menü, Tabs lassen sich ziehen.</div>
    <h5>Letzte Aktion</h5>
    <div class="proto-log" id="proto-log">–</div>`;
}

$('#proto-body').addEventListener('click', (e) => {
  const btn = e.target.closest('.pc');
  if (!btn) return;
  const { act, v } = btn.dataset;
  const b = document.body.classList;
  const t = activeTab();
  switch (act) {
    case 'theme':
      state.theme = v;
      applyTheme();
      break;
    case 'accent':
      state.accent = v;
      applyTheme();
      break;
    case 'anim':
      state.workAnim = v;
      renderTabs();
      break;
    case 'mica':
      b.toggle('no-mica');
      break;
    case 'edge':
      b.toggle('edge');
      break;
    case 'max':
      toggleMax();
      return;
    case 'drag':
      b.toggle('show-drag');
      break;
    case 'status':
      if (t) {
        t.status = v;
        if (['working', 'waiting', 'finished', 'paused'].includes(v)) t.claude = true;
        if (v === 'processes' && !t.claude) t.content = 'npm-dev';
        if (v === 'paused') t.content = 'claude-paused';
        renderTabs();
        renderTerminal();
      }
      break;
    case 'toast': {
      const target = demoToastTarget();
      if (!target) return log('Alle Hintergrund-Tabs haben schon einen Hinweis.');
      fireDemoToast(target, v);
      return;
    }
    case 'toast2': {
      const a = demoToastTarget();
      if (a) fireDemoToast(a, 'finished');
      const b = demoToastTarget();
      if (b) fireDemoToast(b, 'waiting');
      if (!a && !b) log('Alle Hintergrund-Tabs haben schon einen Hinweis.');
      return;
    }
    case 'palette':
      openPalette();
      return;
    case 'settings':
      openSettings();
      return;
    case 'confirm': {
      const busy = state.tabs.find((x) => BUSY.has(x.status));
      if (busy) confirmClose([busy], [busy], () => closeTabs([busy.id]));
      else log('Kein Tab mit laufender Arbeit vorhanden.');
      return;
    }
    case 'confirm-multi': {
      const others = state.tabs.filter((x) => x.id !== state.activeId);
      const busy = others.filter((x) => BUSY.has(x.status));
      if (busy.length) confirmClose(others, busy, () => closeTabs(others.map((x) => x.id)));
      else log('Kein anderer Tab mit laufender Arbeit vorhanden.');
      return;
    }
    case 'overflow':
      state.overflowDemo = !state.overflowDemo;
      if (state.overflowDemo) {
        for (const name of DEMO_NAMES) {
          state.tabs.push(mkTab({ name, demo: true, shell: 'pwsh', folder: `C:\\workspace\\${name}`, status: Math.random() < 0.25 ? 'processes' : 'idle' }));
        }
      } else {
        state.tabs = state.tabs.filter((x) => !x.demo);
        if (!activeTab()) state.activeId = state.tabs[0].id;
      }
      renderAll();
      return;
  }
  renderProto();
});

$('#proto-toggle').addEventListener('click', () => {
  document.body.classList.toggle('panel-open');
  $('#proto-toggle').textContent = document.body.classList.contains('panel-open') ? '–' : '+';
});

// ---------- Start ----------
// Für Screenshots: ?theme=light|dark, ?accent=indigo|teal|mono, ?panel=0
const params = new URLSearchParams(location.search);
if (params.get('theme')) state.theme = params.get('theme');
if (params.get('accent')) state.accent = params.get('accent');
if (params.get('panel') === '0') document.body.classList.remove('panel-open');
if (params.get('still')) document.documentElement.classList.add('still');
applyTheme();
setupChrome();
renderAll();
els.term.focus();

// Für Screenshots: ?tab=<Nr.> aktiviert einen Tab, ?demo=… öffnet eine Ansicht.
if (params.get('tab')) activate(state.tabs[Number(params.get('tab')) - 1]?.id);
switch (params.get('demo')) {
  case 'menu':
    openNewMenu();
    break;
  case 'tabmenu': {
    const r = els.strip.children[1].getBoundingClientRect();
    openTabMenu(state.tabs[1], r.left + 20, r.bottom + 4);
    break;
  }
  case 'palette':
    openPalette();
    break;
  case 'settings':
    openSettings();
    break;
  case 'confirm':
    confirmClose([state.tabs[1]], [state.tabs[1]], () => {});
    break;
  case 'toasts':
    window.focus();
    pushToast(state.tabs[2], 'waiting');
    pushToast(state.tabs[5], 'finished');
    break;
  case 'overflow':
    $('[data-act="overflow"]').click();
    break;
  case 'rename':
    startRename(state.tabs[1].id);
    break;
  case 'tip':
    showTip(els.strip.children[1], tabTipHtml(state.tabs[1]));
    break;
}

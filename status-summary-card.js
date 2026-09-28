/**
 * Status-Übersicht-Karte für Home Assistant Lovelace
 * -----------------------------------------------------
 * Zeigt dynamisch an, wie viele Entitäten einer Gruppe "aktiv" sind:
 *   - covers:      Rollläden geöffnet/geschlossen
 *   - door_window: Fenster/Türen offen/geschlossen
 *   - light:       Lampen ein/aus
 *   - battery:     Batterien schwach/OK
 *   - combo:       alle 4 Kategorien zusammen in einer Karte
 *
 * Darstellung: als volle Karte ("card") oder als kompakter Chip ("chip").
 *
 * Design/Individualisierung: nutzt dasselbe System wie die Abfall-Karte
 * (Trash Card Plus) von Kohle93 – Hintergrund (Theme/Farbton/Akzent/eigene
 * Farbe/transparent) mit Transparenz, Farbverlauf und Glas-Effekt (Blur),
 * Symbol-Hintergrund mit Form, Text- und Rahmenfarbe, Schatten, Eckenradius,
 * Abstände sowie eine Hervorhebung (Leuchten/Pulsieren/Rahmen/Vergrößern),
 * solange der "aktive" Zustand vorliegt (z.B. Fenster offen). Editor mit
 * denselben Tabs/Gruppen-Bausteinen wie in der Abfall-Karte, damit sich
 * beide Karten gleich bedienen.
 *
 * Installation:
 *   1. Diese Datei z.B. nach /config/www/status-summary-card.js kopieren
 *   2. Einstellungen -> Dashboards -> Ressourcen -> Ressource hinzufügen:
 *        URL: /local/status-summary-card.js
 *        Typ: JavaScript-Modul
 *   3. Karte hinzufügen -> "Status-Übersicht-Karte" auswählen (per UI konfigurierbar)
 */

const CARD_VERSION = '2.0.0';
const CARD_TYPE = 'status-summary-card';
const EDITOR_TYPE = 'status-summary-card-editor';

/* ------------------------------------------------------------------ */
/*  Farben – dasselbe System wie in der Abfall-Karte (Trash Card Plus), */
/*  damit sich beide Karten optisch und im Editor identisch verhalten.  */
/* ------------------------------------------------------------------ */

const HA_COLORS = {
  red: [244, 67, 54], pink: [233, 30, 99], purple: [146, 107, 199], 'deep-purple': [110, 65, 171],
  indigo: [63, 81, 181], blue: [33, 150, 243], 'light-blue': [3, 169, 244], cyan: [0, 188, 212],
  teal: [0, 150, 136], green: [76, 175, 80], 'light-green': [139, 195, 74], lime: [205, 220, 57],
  yellow: [255, 235, 59], amber: [255, 193, 7], orange: [255, 152, 0], 'deep-orange': [255, 111, 34],
  brown: [121, 85, 72], 'light-grey': [189, 189, 189], grey: [158, 158, 158], 'dark-grey': [96, 96, 96],
  'blue-grey': [96, 125, 139], black: [0, 0, 0], white: [255, 255, 255],
};

const THEME_BG = 'var(--ha-card-background, var(--card-background-color, #1c1c1c))';

const parseHex = (hex) => {
  let h = hex.replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}/i.test(h)) return null;
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};

// Liefert { css, rgb } für Farbwerte aus dem Farbpicker ([r,g,b]), Hex-Codes,
// HA-Farbnamen ("red", "deep-purple", "primary") oder beliebigen CSS-Farben.
const colorInfo = (value) => {
  if (Array.isArray(value) && value.length >= 3) {
    const rgb = value.slice(0, 3).map((v) => Number(v) || 0);
    return { css: `rgb(${rgb.join(',')})`, rgb };
  }
  if (typeof value !== 'string' || !value.trim()) return null;
  const v = value.trim();
  if (v.startsWith('#')) {
    const rgb = parseHex(v);
    return rgb ? { css: `rgb(${rgb.join(',')})`, rgb } : { css: v, rgb: null };
  }
  if (v === 'primary' || v === 'accent') return { css: `var(--${v}-color)`, rgb: null };
  if (v === 'disabled') return { css: 'var(--disabled-text-color, #9e9e9e)', rgb: [158, 158, 158] };
  if (HA_COLORS[v]) return { css: `rgb(var(--rgb-${v}, ${HA_COLORS[v].join(',')}))`, rgb: HA_COLORS[v] };
  const m = v.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i);
  if (m) return { css: v, rgb: [Number(m[1]), Number(m[2]), Number(m[3])] };
  return { css: v, rgb: null };
};

const withAlpha = (css, pct) => {
  const p = Math.max(0, Math.min(100, Number(pct)));
  if (p >= 100) return css;
  if (p <= 0) return 'transparent';
  return `color-mix(in srgb, ${css} ${p}%, transparent)`;
};

const luminance = ([r, g, b]) => {
  const f = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrastText = (rgb) => (rgb && luminance(rgb) > 0.45 ? '#1c1c1c' : '#ffffff');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const deepGet = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);

/* ------------------------------------------------------------------ */
/*  Konfiguration je Modus: Domain-Filter für den Entity-Picker,        */
/*  Standard-Icons und die Text-Logik für die Kachel.                   */
/* ------------------------------------------------------------------ */
const MODES = {
  covers: {
    label: 'Rollläden',
    filter: [{ domain: 'cover' }],
    activeStates: ['open', 'opening'],
    icon: { active: 'mdi:window-shutter-open', inactive: 'mdi:window-shutter' },
    text: (active, total) => {
      if (total === 0) return 'Keine Rollläden konfiguriert';
      if (active === total) return 'Alle Rollläden geöffnet';
      if (active === 0) return 'Alle Rollläden geschlossen';
      return `${active} Rollläden geöffnet`;
    },
  },
  door_window: {
    label: 'Fenster & Türen',
    filter: [{ domain: 'binary_sensor', device_class: ['door', 'window', 'garage', 'opening'] }],
    activeStates: ['on'],
    icon: { active: 'mdi:window-open-variant', inactive: 'mdi:window-closed-variant' },
    text: (active, total) => {
      if (total === 0) return 'Keine Fenster/Türen konfiguriert';
      if (active === 0) return 'Alle Fenster geschlossen';
      if (active === total) return 'Alle Fenster offen';
      return `${active} Fenster offen`;
    },
  },
  light: {
    label: 'Lampen',
    filter: [{ domain: 'light' }],
    activeStates: ['on'],
    icon: { active: 'mdi:lightbulb-on', inactive: 'mdi:lightbulb-off-outline' },
    text: (active, total) => {
      if (total === 0) return 'Keine Lampen konfiguriert';
      if (active === 0) return 'Alle Lampen aus';
      if (active === total) return 'Alle Lampen eingeschaltet';
      return `${active} Lampen eingeschaltet`;
    },
  },
  battery: {
    label: 'Batterien',
    filter: [{ domain: 'sensor', device_class: 'battery' }, { domain: 'binary_sensor', device_class: 'battery' }],
    icon: { active: 'mdi:battery-alert-variant-outline', inactive: 'mdi:battery-check' },
    text: (active, total) => {
      if (total === 0) return 'Keine Batterien konfiguriert';
      if (active === 0) return 'Alle Batterien OK';
      return `${active} Batterien schwach`;
    },
  },
};

// Reihenfolge der 4 Kacheln im Verbund-Modus.
const COMBO_KEYS = ['covers', 'door_window', 'light', 'battery'];

/* ------------------------------------------------------------------ */
/*  Konfiguration – Standardwerte                                      */
/* ------------------------------------------------------------------ */
const DEFAULTS = {
  mode: 'covers',
  entities: [],
  expand_groups: false,
  layout: 'vertical',
  appearance: 'card',
  battery_threshold: 20,
  icon_size: 32,
  font_size: 13,

  // Design (wie bei der Abfall-Karte)
  bg_mode: 'theme',
  bg_opacity: 100,
  bg_gradient: false,
  blur: 0,
  icon_bg_mode: 'none',
  icon_bg_opacity: 20,
  icon_shape: 'circle',
  text_color_mode: 'auto',
  border_mode: 'none',
  border_width: 1,
  radius: 14,
  shadow: 'soft',
  padding: 16,
  gap: 8,
  highlight: 'none',
};

const SHADOWS = {
  none: 'none',
  theme: 'var(--ha-card-box-shadow, none)',
  soft: '0 2px 8px rgba(0,0,0,.12)',
  strong: '0 6px 20px rgba(0,0,0,.28)',
};
const SHAPES = { circle: '50%', rounded: '30%', square: '6px', none: '0' };

// Übernimmt alte Konfigurationen (style/background_color/background_opacity,
// ui_color-Strings) in das neue Design-System, damit bestehende YAML
// weiterfunktioniert und beim nächsten Speichern automatisch bereinigt wird.
const migrateConfig = (config) => {
  const cfg = { ...config };
  ['icon_color_active', 'icon_color_inactive'].forEach((k) => {
    const v = cfg[k];
    if (typeof v === 'string') {
      const info = v && v !== 'none' ? colorInfo(v) : null;
      if (info && info.rgb) cfg[k] = info.rgb; else delete cfg[k];
    }
  });
  const hadCustomColor = Array.isArray(cfg.background_color) && cfg.background_color.length === 3;
  const hadStyle = cfg.style !== undefined;
  const hadOpacity = cfg.background_opacity !== undefined;
  if ((hadCustomColor || hadStyle || hadOpacity) && cfg.bg_mode === undefined) {
    if (hadCustomColor) {
      cfg.bg_mode = 'custom';
      cfg.bg_color = cfg.background_color;
      cfg.bg_opacity = hadOpacity ? cfg.background_opacity : 100;
    } else if (cfg.style === 'transparent') {
      cfg.bg_mode = 'theme';
      cfg.bg_opacity = hadOpacity ? cfg.background_opacity : 30;
      if (cfg.blur === undefined) cfg.blur = 6;
    } else if (hadOpacity) {
      cfg.bg_mode = 'theme';
      cfg.bg_opacity = cfg.background_opacity;
    }
  }
  delete cfg.background_color;
  delete cfg.background_opacity;
  delete cfg.style;
  return cfg;
};

/* ------------------------------------------------------------------ */
/*  Stil-Berechnung – analog zur itemVars()-Funktion der Abfall-Karte,  */
/*  aber ohne Pro-Eintrag-Overrides: eine Kachel ist entweder "aktiv"   */
/*  (offen/an/schwach) oder "inaktiv" (zu/aus/ok) und bekommt die        */
/*  jeweilige Akzentfarbe (icon_color_active / icon_color_inactive).    */
/* ------------------------------------------------------------------ */
const tileVars = (state, cfg) => {
  const accentCfg = state === 'active' ? cfg.icon_color_active : cfg.icon_color_inactive;
  const accent = colorInfo(accentCfg) || colorInfo(state === 'active' ? 'primary' : 'disabled');
  const bgMode = cfg.bg_mode || DEFAULTS.bg_mode;
  const op = Number(cfg.bg_opacity ?? DEFAULTS.bg_opacity);
  const vars = {};

  // Hintergrund
  let bg = 'transparent';
  let strongRgb = null;
  let strong = false;
  const bgInfo = bgMode === 'custom' ? (colorInfo(cfg.bg_color) || colorInfo([255, 255, 255])) : accent;
  if (bgMode === 'theme') {
    bg = withAlpha(THEME_BG, op);
  } else if (bgMode === 'tinted') {
    const tint = cfg.bg_gradient
      ? `linear-gradient(135deg, ${withAlpha(accent.css, op)} 0%, ${withAlpha(accent.css, Math.round(op * 0.15))} 100%)`
      : `linear-gradient(${withAlpha(accent.css, op)}, ${withAlpha(accent.css, op)})`;
    bg = `${tint}, ${THEME_BG}`;
  } else if (bgMode === 'accent' || bgMode === 'custom') {
    bg = cfg.bg_gradient
      ? `linear-gradient(135deg, ${withAlpha(bgInfo.css, op)} 0%, ${withAlpha(`color-mix(in srgb, ${bgInfo.css} 62%, black)`, op)} 100%)`
      : withAlpha(bgInfo.css, op);
    strong = op >= 55;
    strongRgb = bgInfo.rgb;
  }
  vars['--ssc-bg'] = bg;

  // Text
  let text = 'var(--primary-text-color)';
  const textMode = cfg.text_color_mode || DEFAULTS.text_color_mode;
  if (textMode === 'custom' && colorInfo(cfg.text_color)) text = colorInfo(cfg.text_color).css;
  else if (textMode === 'auto' && strong) text = strongRgb ? contrastText(strongRgb) : '#ffffff';
  vars['--ssc-text'] = text;

  // Symbol-Hintergrund
  let iconBg = 'transparent';
  let iconBgStrongRgb = null;
  const iconBgMode = cfg.icon_bg_mode || DEFAULTS.icon_bg_mode;
  const iconBgOp = Number(cfg.icon_bg_opacity ?? DEFAULTS.icon_bg_opacity);
  if (iconBgMode === 'accent' || iconBgMode === 'custom') {
    const ib = iconBgMode === 'custom' ? (colorInfo(cfg.icon_bg_color) || accent) : accent;
    iconBg = withAlpha(ib.css, iconBgOp);
    if (iconBgOp >= 55) iconBgStrongRgb = ib.rgb || [0, 0, 0];
  } else if (iconBgMode === 'theme') {
    iconBg = withAlpha(THEME_BG, iconBgOp);
  }
  vars['--ssc-ibg'] = iconBg;
  vars['--ssc-ishape'] = SHAPES[cfg.icon_shape || DEFAULTS.icon_shape] || '50%';

  // Symbolfarbe: immer die Akzentfarbe des Zustands, außer der Kontrast auf
  // einem kräftigen Symbol- oder Karten-Hintergrund erfordert eine Gegenfarbe.
  let icon = accent.css;
  if (iconBgStrongRgb) icon = contrastText(iconBgStrongRgb);
  else if (strong && bgMode === 'accent') icon = text;
  vars['--ssc-icolor'] = icon;

  // Rahmen & Schatten
  const bw = Number(cfg.border_width ?? DEFAULTS.border_width) || 0;
  let border = 'none';
  const borderMode = cfg.border_mode || DEFAULTS.border_mode;
  if (borderMode === 'accent') border = `${bw}px solid ${accent.css}`;
  else if (borderMode === 'custom') border = `${bw}px solid ${(colorInfo(cfg.border_color) || accent).css}`;
  else if (borderMode === 'theme') border = `${bw}px solid var(--divider-color, rgba(127,127,127,.3))`;
  vars['--ssc-border'] = border;
  vars['--ssc-shadow'] = SHADOWS[cfg.shadow || DEFAULTS.shadow] || SHADOWS.soft;
  vars['--ssc-accent'] = accent.css;

  return { vars, highlight: cfg.highlight || DEFAULTS.highlight };
};

const styleString = (vars) => Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(';');

const layoutVars = (cfg) => ({
  '--ssc-isize': `${cfg.icon_size ?? DEFAULTS.icon_size}px`,
  '--ssc-fsize': `${cfg.font_size ?? DEFAULTS.font_size}px`,
  '--ssc-radius': `${cfg.radius ?? DEFAULTS.radius}px`,
  '--ssc-pad': `${cfg.padding ?? DEFAULTS.padding}px`,
  '--ssc-gap': `${cfg.gap ?? DEFAULTS.gap}px`,
  '--ssc-bf': Number(cfg.blur) > 0 ? `blur(${cfg.blur}px)` : 'none',
});

/* ------------------------------------------------------------------ */
/*  CSS der Karte                                                      */
/* ------------------------------------------------------------------ */
const CARD_CSS = `
  :host { display: block; height: 100%; }
  ha-card {
    height: 100%;
    display: flex;
    cursor: pointer;
    overflow: visible;
    background: none;
    box-shadow: none;
    border: none;
  }
  .ssc-root { width: 100%; height: 100%; }
  .ssc-combo {
    display: grid;
    width: 100%;
    height: 100%;
    gap: var(--ssc-gap, 8px);
    box-sizing: border-box;
    padding: 4px;
  }
  .ssc-combo.row { grid-template-columns: repeat(4, 1fr); }
  .ssc-combo.grid { grid-template-columns: repeat(2, 1fr); grid-template-rows: repeat(2, 1fr); }

  .ssc-tilebox {
    position: relative; isolation: isolate; box-sizing: border-box;
    display: flex; align-items: center; justify-content: center; text-align: center;
    width: 100%; height: 100%;
    color: var(--ssc-text, var(--primary-text-color));
    border: var(--ssc-border, none);
    border-radius: var(--ssc-radius, 14px);
    box-shadow: var(--ssc-shadow, none);
    transition: transform .15s ease, box-shadow .25s ease;
  }
  /* Hintergrund + Glas-Effekt auf eigener Ebene, damit Unschärfe keine
     Kind-Elemente stört (wie bei der Abfall-Karte). */
  .ssc-tilebox::before {
    content: ''; position: absolute; inset: 0; z-index: -1; border-radius: inherit;
    background: var(--ssc-bg, transparent);
    backdrop-filter: var(--ssc-bf, none); -webkit-backdrop-filter: var(--ssc-bf, none);
    pointer-events: none;
  }
  .ssc-tilebox:active { transform: scale(.98); }

  .ssc-tilebox.vertical { flex-direction: column; gap: var(--ssc-gap, 8px); padding: var(--ssc-pad, 16px) calc(var(--ssc-pad, 16px) * .8); }
  .ssc-tilebox.horizontal { flex-direction: row; gap: calc(var(--ssc-gap, 8px) * 1.5); padding: calc(var(--ssc-pad, 16px) * .65) var(--ssc-pad, 16px); }
  .ssc-tilebox.chip {
    flex-direction: row; gap: calc(var(--ssc-gap, 8px) * .75);
    padding: calc(var(--ssc-pad, 16px) * .4) calc(var(--ssc-pad, 16px) * .75);
    width: auto; height: auto; max-width: 100%; margin: auto; border-radius: 999px;
  }
  .ssc-combo .ssc-tilebox.chip { width: 100%; height: auto; margin: 0; align-self: center; }

  .ssc-icon {
    width: var(--ssc-isize, 32px);
    height: var(--ssc-isize, 32px);
    --mdc-icon-size: var(--ssc-isize, 32px);
    flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    border-radius: var(--ssc-ishape, 50%);
    background: var(--ssc-ibg, transparent);
    color: var(--ssc-icolor, currentColor);
    transition: color .2s ease, background .2s ease;
  }
  .ssc-tilebox.chip .ssc-icon {
    width: calc(var(--ssc-isize, 32px) * 0.6);
    height: calc(var(--ssc-isize, 32px) * 0.6);
    --mdc-icon-size: calc(var(--ssc-isize, 32px) * 0.6);
  }
  .ssc-name {
    font-size: var(--ssc-fsize, 13px);
    font-weight: 500; line-height: 1.3;
    overflow: hidden; text-overflow: ellipsis;
  }
  .ssc-tilebox.chip .ssc-name {
    font-size: calc(var(--ssc-fsize, 13px) * 0.92);
    white-space: nowrap;
  }

  /* Hervorhebung – exakt dieselben Effekte wie in der Abfall-Karte. */
  .ssc-tilebox.hl-glow { box-shadow: 0 0 0 1.5px var(--ssc-accent), 0 0 16px 0 color-mix(in srgb, var(--ssc-accent) 55%, transparent) !important; }
  .ssc-tilebox.hl-border { box-shadow: inset 0 0 0 2px var(--ssc-accent), var(--ssc-shadow) !important; }
  .ssc-tilebox.hl-pulse { animation: ssc-pulse 2.2s ease-in-out infinite; }
  .ssc-tilebox.hl-scale { transform: scale(1.04); z-index: 1; box-shadow: 0 6px 18px color-mix(in srgb, var(--ssc-accent) 40%, transparent) !important; }
  .ssc-tilebox.hl-scale:active { transform: scale(1); }
  @keyframes ssc-pulse {
    0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--ssc-accent) 60%, transparent), var(--ssc-shadow); }
    50% { box-shadow: 0 0 0 7px color-mix(in srgb, var(--ssc-accent) 0%, transparent), var(--ssc-shadow); }
  }
  @media (prefers-reduced-motion: reduce) { .ssc-tilebox.hl-pulse { animation: none; box-shadow: 0 0 0 2px var(--ssc-accent); } }
`;

// ---------------------------------------------------------------------------
// Die eigentliche Karte
// ---------------------------------------------------------------------------
class StatusSummaryCard extends HTMLElement {
  static getConfigElement() {
    return document.createElement(EDITOR_TYPE);
  }

  static getStubConfig() {
    return { type: `custom:${CARD_TYPE}`, ...DEFAULTS };
  }

  setConfig(config) {
    if (!config) {
      throw new Error('Ungültige Konfiguration');
    }
    this._config = { ...DEFAULTS, ...migrateConfig(config) };
    this._update();
  }

  set hass(hass) {
    this._hass = hass;
    this._update();
  }

  getCardSize() {
    const isCombo = this._config?.mode === 'combo';
    const isChip = this._config?.appearance === 'chip';
    if (isChip) return 1;
    if (isCombo) return this._config?.layout === 'grid' ? 3 : 1;
    return this._config?.layout === 'horizontal' ? 1 : 2;
  }

  // Ermöglicht Größenänderung per Ziehen in der "Bereiche"-Dashboard-Ansicht,
  // ohne dass dafür ein eigenes UI-Feld nötig ist.
  getGridOptions() {
    const isCombo = this._config?.mode === 'combo';
    const isChip = this._config?.appearance === 'chip';

    if (isChip && !isCombo) {
      return { columns: 4, rows: 1, min_columns: 2, max_columns: 12, min_rows: 1, max_rows: 2 };
    }
    if (isCombo) {
      const grid = this._config?.layout === 'grid';
      return {
        columns: grid ? 6 : 12,
        rows: grid ? (isChip ? 2 : 4) : (isChip ? 1 : 2),
        min_columns: 4,
        max_columns: 12,
        min_rows: 1,
        max_rows: 8,
      };
    }
    const horizontal = this._config?.layout === 'horizontal';
    return {
      columns: horizontal ? 12 : 4,
      rows: horizontal ? 1 : 2,
      min_columns: 2,
      max_columns: 12,
      min_rows: 1,
      max_rows: 6,
    };
  }

  // Baut (nur bei Bedarf, wenn sich Modus/Layout strukturell geändert haben)
  // die innere DOM-Struktur neu auf: entweder eine einzelne Kachel
  // (Einzelmodus) oder ein Raster/eine Reihe aus 4 Kacheln (Verbund).
  _ensureDom() {
    const isCombo = this._config.mode === 'combo';
    const comboLayout = this._config.layout === 'grid' ? 'grid' : 'row';
    const signature = isCombo ? `combo-${comboLayout}` : 'single';

    if (!this._shadow) {
      this._shadow = this.attachShadow({ mode: 'open' });
      this._shadow.innerHTML = `<style>${CARD_CSS}</style><ha-card><div class="ssc-root"></div></ha-card>`;
      this._cardEl = this._shadow.querySelector('ha-card');
      this._rootEl = this._shadow.querySelector('.ssc-root');
      this._cardEl.addEventListener('click', () => this._handleTap());
    }

    if (this._domSignature === signature) return;
    this._domSignature = signature;

    this._rootEl.innerHTML = '';
    this._tileRefs = [];

    if (isCombo) {
      const comboEl = document.createElement('div');
      comboEl.className = `ssc-combo ${comboLayout}`;
      COMBO_KEYS.forEach((key) => {
        const tile = this._createTile();
        comboEl.appendChild(tile.boxEl);
        this._tileRefs.push({ key, ...tile });
      });
      this._rootEl.appendChild(comboEl);
    } else {
      const tile = this._createTile();
      this._rootEl.appendChild(tile.boxEl);
      this._tileRefs.push({ key: this._config.mode, ...tile });
    }
  }

  _createTile() {
    const boxEl = document.createElement('div');
    boxEl.className = 'ssc-tilebox';
    const iconEl = document.createElement('ha-icon');
    iconEl.className = 'ssc-icon';
    const nameEl = document.createElement('div');
    nameEl.className = 'ssc-name';
    boxEl.appendChild(iconEl);
    boxEl.appendChild(nameEl);
    return { boxEl, iconEl, nameEl };
  }

  // Löst Gruppen-Entitäten (z.B. eine Lampengruppe) in ihre Mitglieder auf,
  // sofern "Gruppen auflösen" aktiviert ist. Eine Entität gilt als Gruppe,
  // wenn sie ein "entity_id"-Attribut mit einer Liste von Mitgliedern hat
  // (so funktionieren HA-Gruppen, hilfsweise auch Licht-/Schalter-Gruppen).
  _resolveEntityList(list) {
    if (!this._config.expand_groups) return list || [];

    const resolved = new Set();
    (list || []).forEach((entityId) => {
      const stateObj = this._hass?.states?.[entityId];
      const members = stateObj?.attributes?.entity_id;
      if (Array.isArray(members) && members.length) {
        members.forEach((memberId) => resolved.add(memberId));
      } else {
        resolved.add(entityId);
      }
    });
    return Array.from(resolved);
  }

  _computeStatusForMode(modeKey, rawEntities) {
    const modeCfg = MODES[modeKey];
    const entities = this._resolveEntityList(rawEntities);
    let active = 0;
    let total = 0;

    entities.forEach((entityId) => {
      const stateObj = this._hass?.states?.[entityId];
      if (!stateObj) return;
      total += 1;

      if (modeKey === 'battery') {
        const domain = entityId.split('.')[0];
        if (domain === 'binary_sensor') {
          if (stateObj.state === 'on') active += 1;
        } else {
          const value = parseFloat(stateObj.state);
          if (!Number.isNaN(value) && value <= (this._config.battery_threshold ?? 20)) active += 1;
        }
      } else if (modeCfg.activeStates.includes(stateObj.state)) {
        active += 1;
      }
    });

    return { active, total };
  }

  _update() {
    if (!this._hass || !this._config) return;
    this._ensureDom();

    const cfg = this._config;
    const isCombo = cfg.mode === 'combo';
    const appearance = cfg.appearance === 'chip' ? 'chip' : 'card';
    const layoutClass = cfg.layout === 'horizontal' ? 'horizontal' : 'vertical';

    this._tileRefs.forEach(({ key, boxEl, iconEl, nameEl }) => {
      const modeCfg = MODES[key];
      const rawEntities = isCombo ? cfg[`${key}_entities`] || [] : cfg.entities || [];
      const { active, total } = this._computeStatusForMode(key, rawEntities);
      const allInactive = active === 0;
      const state = allInactive ? 'inactive' : 'active';

      const name = (!isCombo && cfg.name) || modeCfg.text(active, total);
      const icon = isCombo
        ? allInactive
          ? modeCfg.icon.inactive
          : modeCfg.icon.active
        : allInactive
        ? cfg.icon_inactive || cfg.icon || modeCfg.icon.inactive
        : cfg.icon_active || cfg.icon || modeCfg.icon.active;

      nameEl.textContent = name;
      iconEl.setAttribute('icon', icon);

      const { vars, highlight } = tileVars(state, cfg);
      const isHl = state === 'active' && highlight && highlight !== 'none';
      const cls = ['ssc-tilebox', appearance === 'chip' ? 'chip' : layoutClass];
      if (isHl) cls.push(`hl-${highlight}`);
      boxEl.className = cls.join(' ');
      boxEl.setAttribute('style', styleString(vars));
    });

    const lv = layoutVars(cfg);
    Object.entries(lv).forEach(([k, v]) => this._cardEl.style.setProperty(k, v));
  }

  _handleTap() {
    const action = this._config.tap_action;
    if (!action || action.action === 'none' || !this._hass) return;

    switch (action.action) {
      case 'navigate':
        if (action.navigation_path) {
          history.pushState(null, '', action.navigation_path);
          window.dispatchEvent(new CustomEvent('location-changed', { bubbles: true, composed: true }));
        }
        break;
      case 'url':
        if (action.url_path) window.open(action.url_path);
        break;
      case 'more-info': {
        const entityId = action.entity_id || (this._config.entities || [])[0];
        if (entityId) {
          this.dispatchEvent(
            new CustomEvent('hass-more-info', { detail: { entityId }, bubbles: true, composed: true })
          );
        }
        break;
      }
      case 'call-service':
      case 'perform-action': {
        const service = action.service || action.perform_action;
        if (service) {
          const [domain, svc] = service.split('.');
          this._hass.callService(domain, svc, action.service_data || action.data || {}, action.target);
        }
        break;
      }
      default:
        break;
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Editor – Texte, Tabs & Gruppen (identischer Aufbau wie Trash Card   */
/*  Plus: Tab-Leiste oben, aufklappbare Gruppen, Live-Vorschau).        */
/* ------------------------------------------------------------------ */
const T = {
  tabs: { general: 'Allgemein', display: 'Anzeige', design: 'Design' },
  intro: {
    general: 'Welche Entitäten sollen ausgewertet werden – und mit welchem Symbol/welcher Farbe reagiert die Karte auf „aktiv“ bzw. „inaktiv“?',
    display: 'Grundlayout der Karte: Ausrichtung, Darstellung als Karte oder Chip, Verbund-Anordnung.',
    design: 'Hintergrund, Transparenz und Hervorhebung – genau wie bei der Abfall-Karte individuell einstellbar. Die Vorschau zeigt sofort das Ergebnis.',
  },
  groups: {
    entities: 'Entitäten', filter: 'Bereich / Etage einschränken', behaviour: 'Verhalten',
    icons: 'Symbol & Farbe (aktiv / inaktiv)',
    bg: 'Hintergrund & Transparenz', icon: 'Symbol', text: 'Text',
    frame: 'Rahmen, Form & Abstände', highlight: 'Hervorhebung bei Aktivität',
  },
  fields: {
    mode: 'Was soll angezeigt werden?',
    entities: 'Entitäten',
    covers_entities: 'Rollläden – Entitäten',
    door_window_entities: 'Fenster & Türen – Entitäten',
    light_entities: 'Lampen – Entitäten',
    battery_entities: 'Batterien – Entitäten',
    filter_areas: 'Nur diese(n) Bereich(e) berücksichtigen (für den Button unten)',
    filter_floors: 'Nur diese(n) Etage(n) berücksichtigen (für den Button unten)',
    expand_groups: 'Gruppen auflösen (Mitglieder statt Gruppe zählen)',
    name: 'Name (optional, überschreibt automatischen Text)',
    icon_active: 'Icon – aktiv (z.B. offen/an/schwach)',
    icon_inactive: 'Icon – inaktiv (z.B. geschlossen/aus/OK)',
    icon_color_active: 'Farbe – aktiv (z.B. offen/an/schwach)',
    icon_color_inactive: 'Farbe – inaktiv (z.B. geschlossen/aus/OK)',
    battery_threshold: 'Schwellwert schwache Batterie (%)',
    layout: 'Layout',
    appearance: 'Darstellung (Karte/Chip)',
    tap_action: 'Aktion bei Tippen',
    bg_mode: 'Hintergrund', bg_color: 'Hintergrundfarbe', bg_opacity: 'Deckkraft / Farbstärke', bg_gradient: 'Farbverlauf',
    blur: 'Unschärfe dahinter (Glas-Effekt)',
    icon_size: 'Symbolgröße', icon_bg_mode: 'Symbol-Hintergrund', icon_bg_color: 'Eigene Farbe Symbol-Hintergrund',
    icon_bg_opacity: 'Deckkraft Symbol-Hintergrund', icon_shape: 'Form Symbol-Hintergrund',
    text_color_mode: 'Textfarbe', text_color: 'Eigene Textfarbe', font_size: 'Schriftgröße',
    border_mode: 'Rahmen', border_color: 'Rahmenfarbe', border_width: 'Rahmenstärke',
    shadow: 'Schatten', radius: 'Eckenradius', padding: 'Innenabstand', gap: 'Abstand (Symbol/Text, Verbund-Raster)',
    highlight: 'Hervorhebung',
  },
  helpers: {
    expand_groups: 'Gruppen-Entitäten (z.B. eine Lampengruppe) werden in ihre Mitglieder aufgelöst und einzeln gezählt.',
    filter_areas: 'Schränkt nur den „Alle hinzufügen“-Button unten ein, nicht die bereits gewählten Entitäten.',
    bg_opacity: 'Bei „Theme + Farbton“ ist das die Stärke des Farbtons.',
    blur: 'Der Hintergrund hinter der Kachel wird unscharf durchscheinend – wie Milchglas.',
    highlight: 'Wird nur angezeigt, solange der aktive Zustand vorliegt (z.B. Fenster offen, Batterie schwach).',
  },
  opt: {
    bg_mode: { theme: 'Karten-Hintergrund (Theme)', tinted: 'Theme + Farbton', accent: 'Volle Akzentfarbe', custom: 'Eigene Farbe', none: 'Transparent (kein Hintergrund)' },
    icon_bg_mode: { none: 'Keiner', accent: 'Akzentfarbe', theme: 'Karten-Hintergrund', custom: 'Eigene Farbe' },
    icon_shape: { circle: 'Kreis', rounded: 'Abgerundet', square: 'Eckig' },
    text_color_mode: { auto: 'Automatisch (guter Kontrast)', theme: 'Theme-Textfarbe', custom: 'Eigene Farbe' },
    border_mode: { none: 'Kein Rahmen', accent: 'Akzentfarbe', theme: 'Dezent (Theme)', custom: 'Eigene Farbe' },
    shadow: { soft: 'Weich', none: 'Kein Schatten', theme: 'Wie Theme', strong: 'Kräftig' },
    highlight: { none: 'Keine', glow: 'Leuchten', pulse: 'Pulsieren', border: 'Farbiger Rahmen', scale: 'Etwas größer' },
    layout: { vertical: 'Vertikal', horizontal: 'Horizontal', row: 'Reihe (1x4)', grid: 'Raster (2x2)' },
    appearance: { card: 'Karte', chip: 'Chip (kompakt)' },
  },
  preview: 'Vorschau', preview_active: 'Beispiel: aktiv', preview_inactive: 'Beispiel: inaktiv',
};

const EDITOR_TABS = [
  { id: 'general', icon: 'mdi:tune-variant' },
  { id: 'display', icon: 'mdi:view-dashboard-outline' },
  { id: 'design', icon: 'mdi:palette-outline' },
];

const EDITOR_CSS = `
  :host { display:block; }
  .tabs { display:flex; gap:4px; padding:4px; margin-bottom:16px; border-radius:14px;
    background: var(--secondary-background-color, rgba(127,127,127,.12)); overflow-x:auto; }
  .tab { flex:1 1 0; min-width:62px; display:flex; flex-direction:column; align-items:center; gap:3px;
    padding:8px 4px; border:none; border-radius:10px; background:transparent; cursor:pointer;
    color: var(--secondary-text-color); font: inherit; font-size:12px; font-weight:500; transition: background .15s, color .15s; }
  .tab ha-icon { --mdc-icon-size:20px; }
  .tab:hover { color: var(--primary-text-color); }
  .tab.active { background: var(--card-background-color, #fff); color: var(--primary-color); font-weight:600; box-shadow: 0 1px 4px rgba(0,0,0,.15); }
  .intro { font-size:13px; color: var(--secondary-text-color); margin: 0 2px 14px; line-height:1.45; }
  ha-form { display:block; }

  .pv { padding:14px; margin-bottom:16px; border-radius:14px;
    background: repeating-conic-gradient(rgba(127,127,127,.08) 0% 25%, transparent 0% 50%) 0 0 / 16px 16px, var(--primary-background-color, #f5f5f5); }
  .pv-label { font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.05em; color: var(--secondary-text-color); margin-bottom:10px; }
  .pv-row { display:flex; gap:12px; }
  .pv-row .ssc-tilebox { flex:1; min-width:0; min-height:92px; }
  .pv-row .ssc-name { font-weight:600; }

  .addall { display:block; width:100%; box-sizing:border-box; margin: 4px 0 18px; padding:11px 14px;
    font: inherit; font-size:14px; font-weight:600; color:#fff; background: var(--primary-color, #03a9f4);
    border:none; border-radius:12px; cursor:pointer; }
  .addall:hover { filter: brightness(1.05); }
`;

// Prüft, ob eine Entität zu einem der Domain-/device_class-Filter passt –
// dieselbe Logik, nach der auch der Entity-Picker im Formular filtert.
function matchesFilter(stateObj, filters) {
  if (!filters || !filters.length) return true;
  const domain = stateObj.entity_id.split('.')[0];
  return filters.some((filter) => {
    if (filter.domain && domain !== filter.domain) return false;
    if (filter.device_class) {
      const wanted = Array.isArray(filter.device_class) ? filter.device_class : [filter.device_class];
      if (!wanted.includes(stateObj.attributes.device_class)) return false;
    }
    return true;
  });
}

class StatusSummaryCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._tab = 'general';
  }

  setConfig(config) {
    this._config = { ...DEFAULTS, ...migrateConfig(config || {}) };
    this._refresh();
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (first) this._refresh();
    else this._pushHass();
  }

  get hass() { return this._hass; }

  connectedCallback() { this._refresh(); }

  /* ---------- Hilfen ---------- */

  _t(path) {
    const v = deepGet(T, path);
    return v === undefined ? path.split('.').pop() : v;
  }

  _opts(key, values) {
    return { select: { mode: 'dropdown', options: values.map((v) => ({ value: String(v), label: this._t(`opt.${key}.${v}`) })) } };
  }

  _num(min, max, step = 1, unit = '') {
    return { number: { min, max, step, mode: 'slider', ...(unit ? { unit_of_measurement: unit } : {}) } };
  }

  _group(key, icon, schema, expanded = false) {
    return { type: 'expandable', name: '', flatten: true, title: this._t(`groups.${key}`), icon, expanded, schema };
  }

  _val(key) {
    const v = this._config?.[key];
    return (v === undefined || v === null || v === '') ? DEFAULTS[key] : v;
  }

  _pushHass() {
    this.shadowRoot.querySelectorAll('ha-form').forEach((f) => { f.hass = this._hass; });
  }

  /* ---------- Schemas ---------- */

  _schemaGeneral() {
    const isCombo = this._config.mode === 'combo';
    const s = [
      {
        name: 'mode',
        required: true,
        selector: {
          select: {
            mode: 'dropdown',
            options: [
              ...Object.entries(MODES).map(([value, cfg]) => ({ value, label: cfg.label })),
              { value: 'combo', label: 'Alle 4 Kategorien (Verbund)' },
            ],
          },
        },
      },
    ];

    if (isCombo) {
      s.push(this._group('entities', 'mdi:format-list-bulleted', [
        { name: 'covers_entities', selector: { entity: { multiple: true, filter: MODES.covers.filter } } },
        { name: 'door_window_entities', selector: { entity: { multiple: true, filter: MODES.door_window.filter } } },
        { name: 'light_entities', selector: { entity: { multiple: true, filter: MODES.light.filter } } },
        { name: 'battery_entities', selector: { entity: { multiple: true, filter: MODES.battery.filter } } },
      ], true));
    } else {
      s.push({ name: 'entities', selector: { entity: { multiple: true, filter: MODES[this._config.mode]?.filter } } });
    }

    s.push(this._group('filter', 'mdi:map-marker-outline', [
      { name: 'filter_areas', selector: { area: { multiple: true } } },
      { name: 'filter_floors', selector: { floor: { multiple: true } } },
    ]));

    const behaviourSchema = [{ name: 'expand_groups', selector: { boolean: {} } }];
    if (!isCombo) behaviourSchema.push({ name: 'name', selector: { text: {} } });
    if (isCombo || this._config.mode === 'battery') behaviourSchema.push({ name: 'battery_threshold', selector: this._num(0, 100, 1, '%') });
    s.push(this._group('behaviour', 'mdi:cog-outline', behaviourSchema));

    const iconSchema = [];
    if (!isCombo) {
      iconSchema.push({ type: 'grid', name: '', schema: [
        { name: 'icon_active', selector: { icon: {} } },
        { name: 'icon_inactive', selector: { icon: {} } },
      ] });
    }
    iconSchema.push({ type: 'grid', name: '', schema: [
      { name: 'icon_color_active', selector: { color_rgb: {} } },
      { name: 'icon_color_inactive', selector: { color_rgb: {} } },
    ] });
    s.push(this._group('icons', 'mdi:palette-swatch-outline', iconSchema, true));

    return s;
  }

  _schemaDisplay() {
    const isCombo = this._config.mode === 'combo';
    const s = [];
    s.push({ name: 'layout', selector: this._opts('layout', isCombo ? ['row', 'grid'] : ['vertical', 'horizontal']) });
    s.push({ name: 'appearance', selector: this._opts('appearance', ['card', 'chip']) });
    s.push({ name: 'tap_action', selector: { ui_action: {} } });
    return s;
  }

  _schemaDesign() {
    const v = (k) => this._val(k);
    return [
      this._group('bg', 'mdi:format-color-fill', [
        { name: 'bg_mode', selector: this._opts('bg_mode', ['theme', 'tinted', 'accent', 'custom', 'none']) },
        ...(v('bg_mode') === 'custom' ? [{ name: 'bg_color', selector: { color_rgb: {} } }] : []),
        ...(v('bg_mode') !== 'none' ? [{ name: 'bg_opacity', selector: this._num(0, 100, 1, '%') }] : []),
        ...(['tinted', 'accent', 'custom'].includes(v('bg_mode')) ? [{ name: 'bg_gradient', selector: { boolean: {} } }] : []),
        { name: 'blur', selector: this._num(0, 30, 1, 'px') },
      ], true),
      this._group('icon', 'mdi:emoticon-outline', [
        { name: 'icon_size', selector: this._num(16, 64, 1, 'px') },
        { name: 'icon_bg_mode', selector: this._opts('icon_bg_mode', ['none', 'accent', 'theme', 'custom']) },
        ...(v('icon_bg_mode') === 'custom' ? [{ name: 'icon_bg_color', selector: { color_rgb: {} } }] : []),
        ...(v('icon_bg_mode') !== 'none' ? [
          { name: 'icon_bg_opacity', selector: this._num(0, 100, 1, '%') },
          { name: 'icon_shape', selector: this._opts('icon_shape', ['circle', 'rounded', 'square']) },
        ] : []),
      ]),
      this._group('text', 'mdi:format-text', [
        { name: 'text_color_mode', selector: this._opts('text_color_mode', ['auto', 'theme', 'custom']) },
        ...(v('text_color_mode') === 'custom' ? [{ name: 'text_color', selector: { color_rgb: {} } }] : []),
        { name: 'font_size', selector: this._num(8, 28, 1, 'px') },
      ]),
      this._group('frame', 'mdi:rounded-corner', [
        { name: 'border_mode', selector: this._opts('border_mode', ['none', 'accent', 'theme', 'custom']) },
        ...(v('border_mode') === 'custom' ? [{ name: 'border_color', selector: { color_rgb: {} } }] : []),
        ...(v('border_mode') !== 'none' ? [{ name: 'border_width', selector: this._num(1, 6, 1, 'px') }] : []),
        { name: 'shadow', selector: this._opts('shadow', ['soft', 'none', 'theme', 'strong']) },
        { name: 'radius', selector: this._num(0, 40, 1, 'px') },
        { name: 'padding', selector: this._num(4, 32, 1, 'px') },
        { name: 'gap', selector: this._num(0, 24, 1, 'px') },
      ]),
      this._group('highlight', 'mdi:star-four-points-outline', [
        { name: 'highlight', selector: this._opts('highlight', ['none', 'glow', 'pulse', 'border', 'scale']) },
      ]),
    ];
  }

  _formData() {
    const d = { ...this._config };
    Object.keys(DEFAULTS).forEach((k) => { if (d[k] === undefined) d[k] = this._val(k); });
    return d;
  }

  /* ---------- Rendering ---------- */

  _refresh() {
    if (!this._config || !this._hass) return;
    if (!this._built) this._buildShell();
    this._tabsEl.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === this._tab));
    if (this._tab !== this._paneTab) { this._paneTab = this._tab; this._renderPane(); }
    this._updatePane();
  }

  _buildShell() {
    this._built = true;
    this.shadowRoot.innerHTML = `<style>${CARD_CSS}${EDITOR_CSS}</style><div class="tabs"></div><div class="pane"></div>`;
    this._tabsEl = this.shadowRoot.querySelector('.tabs');
    this._paneEl = this.shadowRoot.querySelector('.pane');
    EDITOR_TABS.forEach((tab) => {
      const b = document.createElement('button');
      b.className = 'tab';
      b.type = 'button';
      b.dataset.tab = tab.id;
      b.innerHTML = `<ha-icon icon="${tab.icon}"></ha-icon><span>${esc(this._t(`tabs.${tab.id}`))}</span>`;
      b.addEventListener('click', () => {
        this._tab = tab.id;
        this._refresh();
      });
      this._tabsEl.appendChild(b);
    });
  }

  _makeForm(onChange) {
    const f = document.createElement('ha-form');
    f.hass = this._hass;
    f.computeLabel = (s) => (s.name ? this._t(`fields.${s.name}`) : '');
    f.computeHelper = (s) => deepGet(T, `helpers.${s.name}`) || '';
    f.addEventListener('value-changed', (ev) => { ev.stopPropagation(); onChange(ev.detail.value); });
    return f;
  }

  _renderPane() {
    const pane = this._paneEl;
    pane.innerHTML = '';
    this._form = null;
    this._pv = null;
    this._addAllBtn = null;

    const intro = document.createElement('div');
    intro.className = 'intro';
    intro.textContent = this._t(`intro.${this._tab}`);
    pane.appendChild(intro);

    if (this._tab === 'design') {
      this._pv = document.createElement('div');
      this._pv.className = 'pv';
      pane.appendChild(this._pv);
    }

    this._form = this._makeForm((value) => this._emit(value));
    pane.appendChild(this._form);

    if (this._tab === 'general') {
      this._addAllBtn = document.createElement('button');
      this._addAllBtn.className = 'addall';
      this._addAllBtn.type = 'button';
      this._addAllBtn.addEventListener('click', () => this._addAllMatching());
      pane.appendChild(this._addAllBtn);
    }
  }

  _updatePane() {
    const schemas = { general: () => this._schemaGeneral(), display: () => this._schemaDisplay(), design: () => this._schemaDesign() };
    if (this._form) {
      this._form.hass = this._hass;
      this._form.schema = schemas[this._tab]();
      this._form.data = this._formData();
    }
    if (this._pv) this._renderPreview();
    if (this._addAllBtn) this._updateAddAllLabel();
  }

  _renderPreview() {
    const cfg = this._config;
    const lv = layoutVars(cfg);
    const mk = (state) => {
      const { vars, highlight } = tileVars(state, cfg);
      const isHl = state === 'active' && highlight && highlight !== 'none';
      const cls = ['ssc-tilebox', 'vertical', isHl ? `hl-${highlight}` : ''].join(' ').trim();
      const modeCfg = MODES[cfg.mode] || MODES.covers;
      const icon = state === 'active' ? (cfg.icon_active || modeCfg.icon.active) : (cfg.icon_inactive || modeCfg.icon.inactive);
      const label = state === 'active' ? this._t('preview_active') : this._t('preview_inactive');
      return `<div class="${cls}" style="${esc(styleString(vars))}"><ha-icon class="ssc-icon" icon="${esc(icon)}"></ha-icon><div class="ssc-name">${esc(label)}</div></div>`;
    };
    this._pv.innerHTML = `<div class="pv-label">${esc(this._t('preview'))}</div><div class="pv-row" style="${esc(styleString(lv))}">${mk('active')}${mk('inactive')}</div>`;
  }

  /* ---------- "Alle passenden Entitäten hinzufügen" ---------- */

  // Alle Areas, die zu den gewählten Etagen gehören, plus die direkt
  // gewählten Areas – zusammen die Menge, auf die der "Alle hinzufügen"-
  // Button die Suche einschränkt (leere Menge = keine Einschränkung).
  _resolveAreaFilterIds() {
    const areaIds = new Set(this._config.filter_areas || []);
    const floorIds = this._config.filter_floors || [];
    if (floorIds.length && this._hass?.areas) {
      Object.values(this._hass.areas).forEach((area) => {
        if (area.floor_id && floorIds.includes(area.floor_id)) areaIds.add(area.area_id);
      });
    }
    return areaIds;
  }

  _getEntityAreaId(entityId) {
    const entry = this._hass?.entities?.[entityId];
    if (!entry) return null;
    if (entry.area_id) return entry.area_id;
    if (entry.device_id) return this._hass?.devices?.[entry.device_id]?.area_id || null;
    return null;
  }

  _matchingEntitiesFor(modeKey) {
    const filters = MODES[modeKey]?.filter;
    const areaIds = this._resolveAreaFilterIds();
    return Object.values(this._hass.states)
      .filter((stateObj) => matchesFilter(stateObj, filters))
      .filter((stateObj) => (areaIds.size ? areaIds.has(this._getEntityAreaId(stateObj.entity_id)) : true))
      .map((stateObj) => stateObj.entity_id)
      .sort();
  }

  _addAllMatching() {
    if (!this._hass || !this._config) return;
    const isCombo = this._config.mode === 'combo';
    let updated;

    if (isCombo) {
      updated = { ...this._config };
      COMBO_KEYS.forEach((key) => {
        const field = `${key}_entities`;
        const matching = this._matchingEntitiesFor(key);
        const current = updated[field] || [];
        updated[field] = Array.from(new Set([...current, ...matching]));
      });
    } else {
      const matching = this._matchingEntitiesFor(this._config.mode);
      const current = this._config.entities || [];
      updated = { ...this._config, entities: Array.from(new Set([...current, ...matching])) };
    }

    this._config = updated;
    this.dispatchEvent(
      new CustomEvent('config-changed', { detail: { config: this._config }, bubbles: true, composed: true })
    );
    this._refresh();
  }

  _updateAddAllLabel() {
    const isCombo = this._config.mode === 'combo';
    const modeCfg = MODES[this._config.mode] || MODES.covers;
    const areaIds = this._resolveAreaFilterIds();
    const scopeSuffix = areaIds.size ? ' (nur gewählter Bereich/Etage)' : '';
    this._addAllBtn.textContent = isCombo
      ? `+ Alle passenden Entitäten aller 4 Kategorien hinzufügen${scopeSuffix}`
      : `+ Alle „${modeCfg.label}“-Entitäten hinzufügen${scopeSuffix}`;
  }

  /* ---------- Änderungen ---------- */

  _emit(value) {
    const cfg = {};
    Object.entries(value).forEach(([k, v]) => {
      if (v === undefined || v === null || v === '') return;
      cfg[k] = v;
    });
    // Werte, die dem Standard entsprechen, nicht in die YAML schreiben
    Object.keys(DEFAULTS).forEach((k) => {
      if (cfg[k] === undefined) return;
      if (JSON.stringify(cfg[k]) === JSON.stringify(DEFAULTS[k]) && this._config[k] === undefined) delete cfg[k];
    });
    if (cfg.mode !== 'battery' && cfg.mode !== 'combo') delete cfg.battery_threshold;
    if (cfg.bg_mode !== 'custom') delete cfg.bg_color;
    if (!cfg.bg_mode || cfg.bg_mode === 'none') delete cfg.bg_opacity;
    if (!['tinted', 'accent', 'custom'].includes(cfg.bg_mode)) delete cfg.bg_gradient;
    if (cfg.icon_bg_mode !== 'custom') delete cfg.icon_bg_color;
    if (!cfg.icon_bg_mode || cfg.icon_bg_mode === 'none') { delete cfg.icon_bg_opacity; delete cfg.icon_shape; }
    if (cfg.text_color_mode !== 'custom') delete cfg.text_color;
    if (cfg.border_mode !== 'custom') delete cfg.border_color;
    if (!cfg.border_mode || cfg.border_mode === 'none') delete cfg.border_width;
    this._config = cfg;
    this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: cfg }, bubbles: true, composed: true }));
    this._refresh();
  }
}

customElements.define(CARD_TYPE, StatusSummaryCard);
customElements.define(EDITOR_TYPE, StatusSummaryCardEditor);

window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === CARD_TYPE)) {
  window.customCards.push({
    type: CARD_TYPE,
    name: 'Status-Übersicht-Karte',
    description:
      'Zeigt dynamisch den Status von Rollläden, Fenstern/Türen, Lampen oder Batterien an – einzeln oder im Verbund, als Karte oder Chip. Individualisierung wie bei der Abfall-Karte: Hintergrund, Transparenz, Farbverlauf, Glas-Effekt, Symbol-Hintergrund, Rahmen, Schatten und Hervorhebung (Leuchten/Pulsieren/Rahmen/Vergrößern).',
    preview: true,
    documentationURL: 'https://github.com/Kohle93/Status-Summary-Card',
  });
}

console.info(`%c📊 STATUS-ÜBERSICHT %c v${CARD_VERSION} `, 'background:#03a9f4;color:#fff;font-weight:700;border-radius:4px 0 0 4px;padding:2px 6px', 'background:#333;color:#fff;border-radius:0 4px 4px 0;padding:2px 6px');

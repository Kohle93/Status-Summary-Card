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
 * Hintergrund: Standard (Theme), transparent mit Blur, oder komplett freie
 * Farbe + Transparenz-Regler.
 *
 * Installation:
 *   1. Diese Datei z.B. nach /config/www/status-summary-card.js kopieren
 *   2. Einstellungen -> Dashboards -> Ressourcen -> Ressource hinzufügen:
 *        URL: /local/status-summary-card.js
 *        Typ: JavaScript-Modul
 *   3. Karte hinzufügen -> "Status-Übersicht-Karte" auswählen (per UI konfigurierbar)
 */

// ---------------------------------------------------------------------------
// Konfiguration je Modus: Domain-Filter für den Entity-Picker, Standard-Icons
// und die Text-Logik für die Kachel.
// ---------------------------------------------------------------------------
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

const DEFAULT_CONFIG = {
  mode: 'covers',
  entities: [],
  expand_groups: false,
  layout: 'vertical',
  appearance: 'card',
  style: 'solid',
  battery_threshold: 20,
  icon_size: 32,
  font_size: 13,
};

// Wandelt den Wert des "ui_color"-Farbpickers (z.B. "red", "deep-purple",
// "primary" oder ein per Farbauswahl gewählter Hex-Code "#a259ff") in eine
// gültige CSS-Farbe um. HA definiert für die Namen entsprechende CSS-Variablen.
function computeCssColor(value) {
  if (!value) return undefined;
  if (value === 'primary') return 'var(--primary-color)';
  if (value === 'accent') return 'var(--accent-color)';
  if (value === 'disabled') return 'var(--disabled-text-color)';
  if (value.startsWith('#') || value.startsWith('rgb') || value.startsWith('var(')) return value;
  return `var(--${value}-color)`;
}

const CARD_CSS = `
  :host { display: block; height: 100%; }
  ha-card {
    height: 100%;
    display: flex;
    cursor: pointer;
    overflow: hidden;
    background: none;
    box-shadow: none;
    border: none;
  }
  .ssc-root { width: 100%; height: 100%; }
  .ssc-combo {
    display: grid;
    width: 100%;
    height: 100%;
    gap: 8px;
    box-sizing: border-box;
    padding: 4px;
  }
  .ssc-combo.row { grid-template-columns: repeat(4, 1fr); }
  .ssc-combo.grid { grid-template-columns: repeat(2, 1fr); grid-template-rows: repeat(2, 1fr); }
  .ssc-tilebox {
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    box-sizing: border-box;
    transition: background 0.2s ease;
    width: 100%;
    height: 100%;
  }
  .ssc-tilebox.vertical { flex-direction: column; gap: 8px; padding: 16px 12px; }
  .ssc-tilebox.horizontal { flex-direction: row; gap: 12px; padding: 10px 16px; }
  /* Chip: eigenständig kompakt und am Inhalt orientiert ... */
  .ssc-tilebox.chip {
    flex-direction: row;
    gap: 6px;
    padding: 6px 12px;
    width: auto;
    height: auto;
    max-width: 100%;
    margin: auto;
  }
  /* ...aber innerhalb des Verbunds füllt jeder Chip seine Rasterzelle in der
     Breite, damit alle 4 Chips gleich groß aussehen, egal wie lang der Text ist. */
  .ssc-combo .ssc-tilebox.chip {
    width: 100%;
    height: auto;
    margin: 0;
    align-self: center;
    box-sizing: border-box;
  }
  .ssc-icon {
    width: var(--ssc-icon-size, 32px);
    height: var(--ssc-icon-size, 32px);
    --mdc-icon-size: var(--ssc-icon-size, 32px);
    flex-shrink: 0;
    transition: color 0.2s ease;
  }
  .ssc-tilebox.chip .ssc-icon {
    width: calc(var(--ssc-icon-size, 32px) * 0.6);
    height: calc(var(--ssc-icon-size, 32px) * 0.6);
    --mdc-icon-size: calc(var(--ssc-icon-size, 32px) * 0.6);
  }
  .ssc-name {
    font-size: var(--ssc-font-size, 13px);
    font-weight: 500;
    line-height: 1.3;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .ssc-tilebox.chip .ssc-name {
    font-size: calc(var(--ssc-font-size, 13px) * 0.92);
    white-space: nowrap;
  }
`;

// ---------------------------------------------------------------------------
// Die eigentliche Karte
// ---------------------------------------------------------------------------
class StatusSummaryCard extends HTMLElement {
  static getConfigElement() {
    return document.createElement('status-summary-card-editor');
  }

  static getStubConfig() {
    return { type: 'custom:status-summary-card', ...DEFAULT_CONFIG };
  }

  setConfig(config) {
    if (!config) {
      throw new Error('Ungültige Konfiguration');
    }
    this._config = { ...DEFAULT_CONFIG, ...config };
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

  // Hintergrund/Rahmen/Form einer Kachel. Reihenfolge der Priorität:
  //   1. Eine frei gewählte Hintergrundfarbe (background_color) + der
  //      Transparenz-Regler (background_opacity) gelten IMMER, wenn gesetzt –
  //      unabhängig von "solid"/"transparent".
  //   2. Ohne eigene Farbe: "transparent" = schwarzes Glas mit Blur (Stärke
  //      ebenfalls über background_opacity einstellbar, Standard 30%).
  //   3. Ohne eigene Farbe und "solid": normaler Theme-Kartenhintergrund.
  _applyBoxStyle(el) {
    const isChip = el.classList.contains('chip');
    const useBlur = this._config.style === 'transparent';
    const customColor = this._config.background_color;
    const hasCustomColor = Array.isArray(customColor) && customColor.length === 3;
    const opacity =
      this._config.background_opacity != null
        ? Math.max(0, Math.min(100, this._config.background_opacity)) / 100
        : useBlur
        ? 0.3
        : 1;

    el.style.borderRadius = isChip ? '999px' : '14px';

    if (useBlur) {
      el.style.setProperty('border', 'none', 'important');
      el.style.setProperty('box-shadow', 'none', 'important');
      el.style.backdropFilter = 'blur(6px)';
      el.style.webkitBackdropFilter = 'blur(6px)';
      el.style.color = 'white';
    } else {
      el.style.removeProperty('border');
      el.style.setProperty('box-shadow', '0 1px 3px rgba(0,0,0,0.3)');
      el.style.backdropFilter = '';
      el.style.webkitBackdropFilter = '';
      el.style.color = '';
    }

    if (hasCustomColor) {
      const [r, g, b] = customColor;
      el.style.background = `rgba(${r}, ${g}, ${b}, ${opacity})`;
    } else if (useBlur) {
      el.style.background = `rgba(0, 0, 0, ${opacity})`;
    } else {
      el.style.background = 'var(--ha-card-background, var(--card-background-color, #1c1c1c))';
    }
  }

  _update() {
    if (!this._hass || !this._config) return;
    this._ensureDom();

    const isCombo = this._config.mode === 'combo';
    const appearance = this._config.appearance === 'chip' ? 'chip' : 'card';
    const layoutClass = this._config.layout === 'horizontal' ? 'horizontal' : 'vertical';

    this._tileRefs.forEach(({ key, boxEl, iconEl, nameEl }) => {
      const modeCfg = MODES[key];
      const rawEntities = isCombo ? this._config[`${key}_entities`] || [] : this._config.entities || [];
      const { active, total } = this._computeStatusForMode(key, rawEntities);
      const allInactive = active === 0;

      const name = (!isCombo && this._config.name) || modeCfg.text(active, total);
      const icon = isCombo
        ? allInactive
          ? modeCfg.icon.inactive
          : modeCfg.icon.active
        : allInactive
        ? this._config.icon_inactive || this._config.icon || modeCfg.icon.inactive
        : this._config.icon_active || this._config.icon || modeCfg.icon.active;
      const color = allInactive
        ? computeCssColor(this._config.icon_color_inactive) || 'var(--disabled-text-color)'
        : computeCssColor(this._config.icon_color_active) || 'var(--primary-color)';

      nameEl.textContent = name;
      iconEl.setAttribute('icon', icon);
      iconEl.style.color = color;

      boxEl.className = `ssc-tilebox ${appearance === 'chip' ? 'chip' : layoutClass}`;
      this._applyBoxStyle(boxEl);
    });

    this._cardEl.style.setProperty('--ssc-icon-size', `${this._config.icon_size || 32}px`);
    this._cardEl.style.setProperty('--ssc-font-size', `${this._config.font_size || 13}px`);
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

// ---------------------------------------------------------------------------
// Grafischer Editor (nutzt HA's eingebautes <ha-form> mit nativen Selectors)
// ---------------------------------------------------------------------------
const FIELD_LABELS = {
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
  icon_color_active: 'Icon-Farbe – aktiv (z.B. offen/an/schwach)',
  icon_color_inactive: 'Icon-Farbe – inaktiv (z.B. geschlossen/aus/OK)',
  battery_threshold: 'Schwellwert schwache Batterie (%)',
  layout: 'Layout',
  appearance: 'Darstellung (Karte/Chip)',
  style: 'Hintergrund-Art',
  background_color: 'Eigene Hintergrundfarbe (überschreibt Hintergrund-Art)',
  background_opacity: 'Hintergrund-Transparenz (%)',
  icon_size: 'Icon-Größe',
  font_size: 'Schriftgröße',
  tap_action: 'Aktion bei Tippen',
};

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
  setConfig(config) {
    this._config = { ...DEFAULT_CONFIG, ...config };
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  connectedCallback() {
    this._render();
  }

  _schema(mode) {
    const isCombo = mode === 'combo';
    const schema = [
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
      schema.push(
        { name: 'covers_entities', selector: { entity: { multiple: true, filter: MODES.covers.filter } } },
        { name: 'door_window_entities', selector: { entity: { multiple: true, filter: MODES.door_window.filter } } },
        { name: 'light_entities', selector: { entity: { multiple: true, filter: MODES.light.filter } } },
        { name: 'battery_entities', selector: { entity: { multiple: true, filter: MODES.battery.filter } } }
      );
    } else {
      schema.push({ name: 'entities', selector: { entity: { multiple: true, filter: MODES[mode]?.filter } } });
    }

    schema.push(
      { name: 'filter_areas', selector: { area: { multiple: true } } },
      { name: 'filter_floors', selector: { floor: { multiple: true } } }
    );

    if (isCombo) {
      schema.push(
        { name: 'battery_threshold', selector: { number: { min: 0, max: 100, mode: 'box', unit_of_measurement: '%' } } },
        { name: 'expand_groups', selector: { boolean: {} } },
        { name: 'icon_color_active', selector: { ui_color: { include_none: true } } },
        { name: 'icon_color_inactive', selector: { ui_color: { include_none: true } } },
        {
          name: 'layout',
          selector: {
            select: {
              mode: 'dropdown',
              options: [
                { value: 'row', label: 'Reihe (1x4)' },
                { value: 'grid', label: 'Raster (2x2)' },
              ],
            },
          },
        }
      );
    } else {
      schema.push(
        { name: 'expand_groups', selector: { boolean: {} } },
        { name: 'name', selector: { text: {} } },
        { name: 'icon_active', selector: { icon: {} } },
        { name: 'icon_inactive', selector: { icon: {} } },
        { name: 'icon_color_active', selector: { ui_color: { include_none: true } } },
        { name: 'icon_color_inactive', selector: { ui_color: { include_none: true } } }
      );

      if (mode === 'battery') {
        schema.push({
          name: 'battery_threshold',
          selector: { number: { min: 0, max: 100, mode: 'box', unit_of_measurement: '%' } },
        });
      }

      schema.push({
        name: 'layout',
        selector: {
          select: {
            mode: 'dropdown',
            options: [
              { value: 'vertical', label: 'Vertikal' },
              { value: 'horizontal', label: 'Horizontal' },
            ],
          },
        },
      });
    }

    schema.push(
      {
        name: 'appearance',
        selector: {
          select: {
            mode: 'dropdown',
            options: [
              { value: 'card', label: 'Karte' },
              { value: 'chip', label: 'Chip (kompakt)' },
            ],
          },
        },
      },
      {
        name: 'style',
        selector: {
          select: {
            mode: 'dropdown',
            options: [
              { value: 'solid', label: 'Normal (Karten-Hintergrund)' },
              { value: 'transparent', label: 'Transparent / Glas-Effekt' },
            ],
          },
        },
      },
      { name: 'background_color', selector: { color_rgb: {} } },
      { name: 'background_opacity', selector: { number: { min: 0, max: 100, step: 5, mode: 'slider', unit_of_measurement: '%' } } },
      { name: 'icon_size', selector: { number: { min: 16, max: 64, step: 1, mode: 'slider', unit_of_measurement: 'px' } } },
      { name: 'font_size', selector: { number: { min: 8, max: 28, step: 1, mode: 'slider', unit_of_measurement: 'px' } } },
      { name: 'tap_action', selector: { ui_action: {} } }
    );

    return schema;
  }

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
    this._render();
  }

  _render() {
    if (!this._hass || !this._config) return;

    if (!this._addAllButton) {
      this._addAllButton = document.createElement('button');
      this._addAllButton.type = 'button';
      this._addAllButton.style.cssText = [
        'display: block',
        'width: 100%',
        'box-sizing: border-box',
        'margin: 4px 0 16px 0',
        'padding: 10px 14px',
        'font-size: 14px',
        'font-weight: 600',
        'font-family: inherit',
        'color: #ffffff',
        'background: var(--primary-color, #03a9f4)',
        'border: none',
        'border-radius: 6px',
        'cursor: pointer',
      ].join(';');
      this._addAllButton.addEventListener('click', () => this._addAllMatching());
      this.appendChild(this._addAllButton);
    }

    if (!this._form) {
      this._form = document.createElement('ha-form');
      this._form.addEventListener('value-changed', (ev) => {
        ev.stopPropagation();
        this._config = ev.detail.value;
        this.dispatchEvent(
          new CustomEvent('config-changed', { detail: { config: this._config }, bubbles: true, composed: true })
        );
        this._render();
      });
      this.appendChild(this._form);
    }

    const isCombo = this._config.mode === 'combo';
    const modeCfg = MODES[this._config.mode] || MODES.covers;
    const areaIds = this._resolveAreaFilterIds();
    const scopeSuffix = areaIds.size ? ' (nur gewählter Bereich/Etage)' : '';
    this._addAllButton.textContent = isCombo
      ? `+ Alle passenden Entitäten aller 4 Kategorien hinzufügen${scopeSuffix}`
      : `+ Alle „${modeCfg.label}“-Entitäten hinzufügen${scopeSuffix}`;

    this._form.hass = this._hass;
    this._form.data = this._config;
    this._form.schema = this._schema(this._config.mode);
    this._form.computeLabel = (schemaItem) => FIELD_LABELS[schemaItem.name] || schemaItem.name;
  }
}

customElements.define('status-summary-card', StatusSummaryCard);
customElements.define('status-summary-card-editor', StatusSummaryCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'status-summary-card',
  name: 'Status-Übersicht-Karte',
  description:
    'Zeigt dynamisch den Status von Rollläden, Fenstern/Türen, Lampen oder Batterien an – einzeln oder im Verbund, als Karte oder Chip, mit frei wählbarer Hintergrundfarbe und -transparenz.',
});

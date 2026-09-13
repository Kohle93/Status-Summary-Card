/**
 * Status-Übersicht-Karte für Home Assistant Lovelace
 * -----------------------------------------------------
 * Zeigt dynamisch an, wie viele Entitäten einer Gruppe "aktiv" sind:
 *   - covers:      Rollläden geöffnet/geschlossen
 *   - door_window: Fenster/Türen offen/geschlossen
 *   - light:       Lampen ein/aus
 *   - battery:     Batterien schwach/OK
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

const DEFAULT_CONFIG = {
  mode: 'covers',
  entities: [],
  layout: 'vertical',
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
    this._buildDom();
    this._update();
  }

  set hass(hass) {
    this._hass = hass;
    this._update();
  }

  getCardSize() {
    return this._config?.layout === 'horizontal' ? 1 : 2;
  }

  // Ermöglicht Größenänderung per Ziehen in der "Bereiche"-Dashboard-Ansicht,
  // ohne dass dafür ein eigenes UI-Feld nötig ist.
  getGridOptions() {
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

  _buildDom() {
    if (this._built) return;
    this._built = true;

    const shadow = this.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        :host { display: block; height: 100%; }
        ha-card {
          height: 100%;
          display: flex;
          cursor: pointer;
          overflow: hidden;
          transition: background 0.2s ease;
        }
        .wrapper {
          display: flex;
          width: 100%;
          align-items: center;
          justify-content: center;
          text-align: center;
          box-sizing: border-box;
        }
        .wrapper.vertical {
          flex-direction: column;
          gap: 8px;
          padding: 16px 12px;
        }
        .wrapper.horizontal {
          flex-direction: row;
          gap: 12px;
          padding: 10px 16px;
        }
        ha-icon.icon {
          width: var(--ssc-icon-size, 32px);
          height: var(--ssc-icon-size, 32px);
          --mdc-icon-size: var(--ssc-icon-size, 32px);
          flex-shrink: 0;
          transition: color 0.2s ease;
        }
        .name {
          font-size: var(--ssc-font-size, 13px);
          font-weight: 500;
          line-height: 1.3;
        }
      </style>
      <ha-card>
        <div class="wrapper">
          <ha-icon class="icon"></ha-icon>
          <div class="name"></div>
        </div>
      </ha-card>
    `;

    this._cardEl = shadow.querySelector('ha-card');
    this._wrapperEl = shadow.querySelector('.wrapper');
    this._iconEl = shadow.querySelector('.icon');
    this._nameEl = shadow.querySelector('.name');

    this._cardEl.addEventListener('click', () => this._handleTap());
  }

  _computeStatus() {
    const { mode, entities, battery_threshold } = this._config;
    const modeCfg = MODES[mode];
    let active = 0;
    let total = 0;

    (entities || []).forEach((entityId) => {
      const stateObj = this._hass?.states?.[entityId];
      if (!stateObj) return;
      total += 1;

      if (mode === 'battery') {
        const domain = entityId.split('.')[0];
        if (domain === 'binary_sensor') {
          if (stateObj.state === 'on') active += 1;
        } else {
          const value = parseFloat(stateObj.state);
          if (!Number.isNaN(value) && value <= (battery_threshold ?? 20)) active += 1;
        }
      } else if (modeCfg.activeStates.includes(stateObj.state)) {
        active += 1;
      }
    });

    return { active, total };
  }

  _update() {
    if (!this._hass || !this._config || !this._built) return;

    const modeCfg = MODES[this._config.mode] || MODES.covers;
    const { active, total } = this._computeStatus();
    const allInactive = active === 0;

    const name = this._config.name || modeCfg.text(active, total);
    const icon = allInactive
      ? this._config.icon_inactive || this._config.icon || modeCfg.icon.inactive
      : this._config.icon_active || this._config.icon || modeCfg.icon.active;
    const color = allInactive
      ? computeCssColor(this._config.icon_color_inactive) || 'var(--disabled-text-color)'
      : computeCssColor(this._config.icon_color_active) || 'var(--primary-color)';

    this._nameEl.textContent = name;
    this._iconEl.setAttribute('icon', icon);
    this._iconEl.style.color = color;

    this._cardEl.style.setProperty('--ssc-icon-size', `${this._config.icon_size || 32}px`);
    this._cardEl.style.setProperty('--ssc-font-size', `${this._config.font_size || 13}px`);

    this._wrapperEl.classList.toggle('vertical', this._config.layout !== 'horizontal');
    this._wrapperEl.classList.toggle('horizontal', this._config.layout === 'horizontal');

    const cardStyle = this._cardEl.style;
    if (this._config.style === 'transparent') {
      cardStyle.setProperty('border', 'none', 'important');
      cardStyle.setProperty('box-shadow', 'none', 'important');
      cardStyle.background = 'rgba(0,0,0,0.3)';
      cardStyle.borderRadius = '14px';
      cardStyle.backdropFilter = 'blur(6px)';
      cardStyle.webkitBackdropFilter = 'blur(6px)';
      cardStyle.color = 'white';
    } else {
      cardStyle.removeProperty('border');
      cardStyle.removeProperty('box-shadow');
      cardStyle.background = '';
      cardStyle.borderRadius = '';
      cardStyle.backdropFilter = '';
      cardStyle.webkitBackdropFilter = '';
      cardStyle.color = '';
    }
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
  name: 'Name (optional, überschreibt automatischen Text)',
  icon_active: 'Icon – aktiv (z.B. offen/an/schwach)',
  icon_inactive: 'Icon – inaktiv (z.B. geschlossen/aus/OK)',
  icon_color_active: 'Icon-Farbe – aktiv (z.B. offen/an/schwach)',
  icon_color_inactive: 'Icon-Farbe – inaktiv (z.B. geschlossen/aus/OK)',
  battery_threshold: 'Schwellwert schwache Batterie (%)',
  layout: 'Layout',
  style: 'Darstellung',
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
    const schema = [
      {
        name: 'mode',
        required: true,
        selector: {
          select: {
            mode: 'dropdown',
            options: Object.entries(MODES).map(([value, cfg]) => ({ value, label: cfg.label })),
          },
        },
      },
      {
        name: 'entities',
        selector: { entity: { multiple: true, filter: MODES[mode]?.filter } },
      },
      { name: 'name', selector: { text: {} } },
      { name: 'icon_active', selector: { icon: {} } },
      { name: 'icon_inactive', selector: { icon: {} } },
      { name: 'icon_color_active', selector: { ui_color: { include_none: true } } },
      { name: 'icon_color_inactive', selector: { ui_color: { include_none: true } } },
    ];

    if (mode === 'battery') {
      schema.push({
        name: 'battery_threshold',
        selector: { number: { min: 0, max: 100, mode: 'box', unit_of_measurement: '%' } },
      });
    }

    schema.push(
      {
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
      },
      {
        name: 'style',
        selector: {
          select: {
            mode: 'dropdown',
            options: [
              { value: 'solid', label: 'Normal (Karten-Hintergrund)' },
              { value: 'transparent', label: 'Transparent' },
            ],
          },
        },
      },
      { name: 'icon_size', selector: { number: { min: 16, max: 64, step: 1, mode: 'slider', unit_of_measurement: 'px' } } },
      { name: 'font_size', selector: { number: { min: 8, max: 28, step: 1, mode: 'slider', unit_of_measurement: 'px' } } },
      { name: 'tap_action', selector: { ui_action: {} } }
    );

    return schema;
  }

  _addAllMatching() {
    if (!this._hass || !this._config) return;

    const filters = MODES[this._config.mode]?.filter;
    const matching = Object.values(this._hass.states)
      .filter((stateObj) => matchesFilter(stateObj, filters))
      .map((stateObj) => stateObj.entity_id)
      .sort();

    const current = this._config.entities || [];
    const merged = Array.from(new Set([...current, ...matching]));

    this._config = { ...this._config, entities: merged };
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

    const modeCfg = MODES[this._config.mode] || MODES.covers;
    this._addAllButton.textContent = `+ Alle „${modeCfg.label}“-Entitäten hinzufügen`;

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
    'Zeigt dynamisch den Status von Rollläden, Fenstern/Türen, Lampen oder Batterien an – frei konfigurierbar im UI.',
});

<script lang="ts">
  import { themeStore, THEME_PRESETS, DEFAULT_THEME } from '../stores/theme';
  import type { ThemeConfig } from '../types';

  interface Props {
    onclose: () => void;
  }

  let { onclose }: Props = $props();

  type ColorKey = keyof ThemeConfig['colors'];

  interface ColorRow {
    label: string;
    /** First key is shown; all keys are set together */
    keys: ColorKey[];
    hint?: string;
  }

  const SECTIONS: Array<{ title: string; rows: ColorRow[] }> = [
    {
      title: 'Nodes',
      rows: [
        { label: 'Fill', keys: ['mainBkg'] },
        { label: 'Border', keys: ['primaryBorderColor'] },
        { label: 'Text', keys: ['nodeTextColor', 'primaryTextColor'] }
      ]
    },
    {
      title: 'Groups',
      rows: [
        { label: 'Fill', keys: ['clusterBkg'], hint: 'Subgraphs, namespaces, composite states' },
        { label: 'Border', keys: ['clusterBorder'], hint: 'Also architecture-beta group borders' },
        { label: 'Title', keys: ['titleColor'] }
      ]
    },
    {
      title: 'Edges',
      rows: [
        { label: 'Lines & arrows', keys: ['lineColor'] },
        { label: 'Label background', keys: ['edgeLabelBackground'] },
        { label: 'Architecture edges', keys: ['archEdgeColor'] }
      ]
    },
    {
      title: 'Notes',
      rows: [
        { label: 'Fill', keys: ['noteBkgColor'] },
        { label: 'Border', keys: ['noteBorderColor'] }
      ]
    },
    {
      title: 'Canvas & accents',
      rows: [
        { label: 'Background', keys: ['background'], hint: 'Preview and PNG export background' },
        { label: 'Text', keys: ['textColor'] },
        { label: 'Primary', keys: ['primaryColor'], hint: 'Used by e.g. sequence, pie, gantt, mindmap' },
        { label: 'Secondary', keys: ['secondaryColor'] },
        { label: 'Tertiary', keys: ['tertiaryColor'] }
      ]
    }
  ];

  const FONTS = [
    { label: 'System (Inter)', value: 'Inter, system-ui, sans-serif' },
    { label: 'Arial / Helvetica', value: 'Arial, Helvetica, sans-serif' },
    { label: 'Segoe UI', value: "'Segoe UI', Roboto, sans-serif" },
    { label: 'Verdana', value: 'Verdana, Geneva, sans-serif' },
    { label: 'Trebuchet MS', value: "'Trebuchet MS', sans-serif" },
    { label: 'Georgia (serif)', value: 'Georgia, serif' },
    { label: 'Monospace', value: "'JetBrains Mono', 'Fira Code', Consolas, monospace" }
  ];

  let theme = $state<ThemeConfig>(themeStore.getTheme());
  let copied = $state(false);

  $effect(() => themeStore.subscribe((t) => (theme = t)));

  const isCustomFont = $derived(!FONTS.some((f) => f.value === theme.fonts.fontFamily));

  function setColor(row: ColorRow, value: string) {
    for (const key of row.keys) themeStore.setColor(key, value);
  }

  /** <input type="color"> only understands #rrggbb */
  function pickerValue(value: string): string {
    if (/^#[0-9a-f]{6}$/i.test(value)) return value;
    const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(value);
    return short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}` : '#000000';
  }

  function handleFontSelect(e: Event) {
    const value = (e.target as HTMLSelectElement).value;
    themeStore.setFonts({ fontFamily: value || theme.fonts.fontFamily });
  }

  function handleFontSize(e: Event) {
    const size = Number((e.target as HTMLInputElement).value);
    if (size >= 8 && size <= 32) themeStore.setFonts({ fontSize: size });
  }

  async function copyJson() {
    await navigator.clipboard.writeText(JSON.stringify(theme, null, 2));
    copied = true;
    setTimeout(() => (copied = false), 2000);
  }
</script>

<aside class="theme-panel" aria-label="Diagram style">
  <header>
    <h2>Diagram style</h2>
    <button class="icon-btn" onclick={onclose} title="Close" aria-label="Close style panel">
      <svg viewBox="0 0 20 20" fill="currentColor"><path d="M5.3 5.3a1 1 0 011.4 0L10 8.6l3.3-3.3a1 1 0 111.4 1.4L11.4 10l3.3 3.3a1 1 0 01-1.4 1.4L10 11.4l-3.3 3.3a1 1 0 01-1.4-1.4L8.6 10 5.3 6.7a1 1 0 010-1.4z"/></svg>
    </button>
  </header>

  <div class="scroll">
    <section>
      <h3>Preset</h3>
      <div class="presets">
        {#each THEME_PRESETS as preset (preset.id)}
          <button
            class="preset"
            class:active={theme.id === preset.id}
            onclick={() => themeStore.setTheme(preset)}
          >
            <span class="swatches">
              <span style="background: {preset.colors.mainBkg}; border-color: {preset.colors.primaryBorderColor}"></span>
              <span style="background: {preset.colors.clusterBkg}; border-color: {preset.colors.clusterBorder}"></span>
              <span style="background: {preset.colors.background}; border-color: {preset.colors.lineColor}"></span>
            </span>
            {preset.name}
          </button>
        {/each}
      </div>
      {#if theme.id === 'custom'}
        <p class="note">Customized — pick a preset to start over.</p>
      {/if}
    </section>

    <section>
      <h3>Font</h3>
      <label class="row">
        <span>Family</span>
        <select value={isCustomFont ? '' : theme.fonts.fontFamily} onchange={handleFontSelect}>
          {#each FONTS as font (font.value)}
            <option value={font.value}>{font.label}</option>
          {/each}
          <option value="">Custom…</option>
        </select>
      </label>
      {#if isCustomFont}
        <label class="row">
          <span>CSS font</span>
          <input
            class="text"
            value={theme.fonts.fontFamily}
            onchange={(e) => themeStore.setFonts({ fontFamily: (e.target as HTMLInputElement).value })}
          />
        </label>
      {/if}
      <label class="row">
        <span>Size</span>
        <input type="range" min="10" max="24" value={theme.fonts.fontSize} oninput={handleFontSize} />
        <input class="num" type="number" min="8" max="32" value={theme.fonts.fontSize} onchange={handleFontSize} />
      </label>
    </section>

    {#each SECTIONS as section (section.title)}
      <section>
        <h3>{section.title}</h3>
        {#each section.rows as row (row.keys[0])}
          <label class="row" title={row.hint}>
            <span>{row.label}</span>
            <input
              type="color"
              value={pickerValue(theme.colors[row.keys[0]])}
              oninput={(e) => setColor(row, (e.target as HTMLInputElement).value)}
            />
            <input
              class="text hex"
              value={theme.colors[row.keys[0]]}
              onchange={(e) => setColor(row, (e.target as HTMLInputElement).value.trim())}
              spellcheck="false"
            />
          </label>
        {/each}
      </section>
    {/each}
  </div>

  <footer>
    <button class="secondary" onclick={() => themeStore.setTheme(DEFAULT_THEME)}>Reset</button>
    <button class="secondary" onclick={copyJson} title="Copy the theme as JSON (usable with the CLI's --theme option)">
      {copied ? 'Copied' : 'Copy JSON'}
    </button>
  </footer>
</aside>

<style>
  .theme-panel {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: 300px;
    display: flex;
    flex-direction: column;
    background: #ffffff;
    border-left: 1px solid #dee2e6;
    box-shadow: -4px 0 16px rgba(0, 0, 0, 0.06);
    z-index: 20;
    font-size: 13px;
    color: #212529;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px 10px 16px;
    border-bottom: 1px solid #e9ecef;
  }

  h2 {
    font-size: 14px;
    font-weight: 600;
  }

  h3 {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #868e96;
    margin-bottom: 6px;
  }

  .scroll {
    flex: 1;
    overflow-y: auto;
    padding: 4px 16px 12px;
  }

  section {
    padding: 10px 0;
    border-bottom: 1px solid #f1f3f5;
  }

  section:last-child {
    border-bottom: none;
  }

  .presets {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
  }

  .preset {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 8px 4px;
    border: 1px solid #dee2e6;
    border-radius: 6px;
    background: #ffffff;
    font-size: 12px;
    color: #495057;
    cursor: pointer;
  }

  .preset:hover {
    border-color: #adb5bd;
  }

  .preset.active {
    border-color: #4C78A8;
    box-shadow: 0 0 0 1px #4C78A8;
    color: #212529;
  }

  .swatches {
    display: flex;
    gap: 3px;
  }

  .swatches span {
    width: 14px;
    height: 14px;
    border-radius: 3px;
    border: 1.5px solid;
  }

  .note {
    margin-top: 6px;
    font-size: 11px;
    color: #868e96;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 3px 0;
  }

  .row > span {
    flex: 1;
    color: #495057;
  }

  input[type='color'] {
    width: 28px;
    height: 24px;
    padding: 0;
    border: 1px solid #dee2e6;
    border-radius: 4px;
    background: none;
    cursor: pointer;
  }

  .text,
  select,
  .num {
    border: 1px solid #dee2e6;
    border-radius: 4px;
    padding: 3px 6px;
    font-size: 12px;
    font-family: inherit;
    color: #212529;
    background: #ffffff;
  }

  select {
    width: 150px;
  }

  .text {
    width: 150px;
  }

  .hex {
    width: 80px;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
  }

  .num {
    width: 52px;
  }

  input[type='range'] {
    width: 90px;
  }

  footer {
    display: flex;
    gap: 8px;
    padding: 10px 16px;
    border-top: 1px solid #e9ecef;
  }

  .secondary {
    flex: 1;
    padding: 6px 10px;
    border: 1px solid #dee2e6;
    border-radius: 6px;
    background: #ffffff;
    color: #495057;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
  }

  .secondary:hover {
    background: #f1f3f5;
  }

  .icon-btn {
    display: flex;
    border: none;
    background: transparent;
    color: #868e96;
    padding: 4px;
    border-radius: 4px;
    cursor: pointer;
  }

  .icon-btn:hover {
    background: #f1f3f5;
    color: #212529;
  }

  .icon-btn svg {
    width: 16px;
    height: 16px;
  }
</style>

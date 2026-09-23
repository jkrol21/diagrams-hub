<script lang="ts">
  interface Props {
    onnew: () => void;
    onopen: () => void;
    onsave: () => void;
    onsaveas: () => void;
    onexport: () => void;
    exportDisabled?: boolean;
    onexample: (name: string, code: string) => void;
    onstyle: () => void;
    styleOpen?: boolean;
  }

  let {
    onnew, onopen, onsave, onsaveas, onexport, exportDisabled = false,
    onexample, onstyle, styleOpen = false
  }: Props = $props();

  // Example diagrams from /examples (one per diagram type)
  const exampleFiles = import.meta.glob<string>('/examples/*.{mmd,json}', {
    query: '?raw',
    import: 'default',
    eager: true
  });
  const examples = Object.entries(exampleFiles)
    .map(([path, code]) => ({ name: path.split('/').pop()!.replace(/\.(mmd|json)$/, ''), code }))
    .sort((a, b) => a.name.localeCompare(b.name));

  let examplesOpen = $state(false);

  function pickExample(example: { name: string; code: string }) {
    examplesOpen = false;
    onexample(example.name, example.code);
  }
</script>

<svelte:window onclick={() => (examplesOpen = false)} />

<div class="toolbar">
  <div class="toolbar-left">
    <div class="brand">
      <svg class="logo" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 2L2 7l10 5 10-5-10-5z"/>
        <path d="M2 17l10 5 10-5"/>
        <path d="M2 12l10 5 10-5"/>
      </svg>
      <span class="brand-text">Diagrams Hub</span>
    </div>
  </div>

  <div class="toolbar-center">
    <button class="toolbar-btn" onclick={onnew} title="New diagram">
      <svg viewBox="0 0 20 20" fill="currentColor">
        <path fill-rule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clip-rule="evenodd" />
      </svg>
      New
    </button>

    <button class="toolbar-btn" onclick={onopen} title="Open diagram">
      <svg viewBox="0 0 20 20" fill="currentColor">
        <path fill-rule="evenodd" d="M2 6a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1H8a3 3 0 00-3 3v1.5a1.5 1.5 0 01-3 0V6z" clip-rule="evenodd" />
        <path d="M6 12a2 2 0 012-2h8a2 2 0 012 2v2a2 2 0 01-2 2H2h2a2 2 0 002-2v-2z" />
      </svg>
      Open
    </button>

    <div class="toolbar-divider"></div>

    <button class="toolbar-btn" onclick={onsave} title="Save diagram">
      <svg viewBox="0 0 20 20" fill="currentColor">
        <path d="M7.707 10.293a1 1 0 10-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 11.586V6h5a2 2 0 012 2v7a2 2 0 01-2 2H4a2 2 0 01-2-2V8a2 2 0 012-2h5v5.586l-1.293-1.293zM9 4a1 1 0 012 0v2H9V4z" />
      </svg>
      Save
    </button>

    <button class="toolbar-btn" onclick={onsaveas} title="Save as new file">
      <svg viewBox="0 0 20 20" fill="currentColor">
        <path d="M9.707 7.293a1 1 0 00-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L13 9.586V4h2a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2h2v5.586L5.707 8.293a1 1 0 00-1.414 1.414l3 3a1 1 0 001.414 0l1-1L9.707 7.293z" />
      </svg>
      Save As
    </button>

    <div class="toolbar-divider"></div>

    <div class="menu-anchor">
      <button
        class="toolbar-btn"
        class:active={examplesOpen}
        onclick={(e) => { e.stopPropagation(); examplesOpen = !examplesOpen; }}
        title="Load an example diagram"
        aria-haspopup="menu"
        aria-expanded={examplesOpen}
      >
        <svg viewBox="0 0 20 20" fill="currentColor">
          <path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z" />
        </svg>
        Examples
      </button>
      {#if examplesOpen}
        <div class="menu" role="menu">
          {#each examples as example (example.name)}
            <button class="menu-item" role="menuitem" onclick={() => pickExample(example)}>{example.name}</button>
          {/each}
        </div>
      {/if}
    </div>

    <button class="toolbar-btn" class:active={styleOpen} onclick={onstyle} title="Colors and fonts for rendering">
      <svg viewBox="0 0 20 20" fill="currentColor">
        <path fill-rule="evenodd" d="M4 2a2 2 0 00-2 2v11a3 3 0 106 0V4a2 2 0 00-2-2H4zm1 14a1 1 0 100-2 1 1 0 000 2zm5-1.757l4.9-4.9a2 2 0 000-2.828L13.485 5.1a2 2 0 00-2.828 0L10 5.757v8.486zM16 18H9.071l6-6H16a2 2 0 012 2v2a2 2 0 01-2 2z" clip-rule="evenodd" />
      </svg>
      Style
    </button>
  </div>

  <div class="toolbar-right">
    <button
      class="toolbar-btn export-btn"
      onclick={onexport}
      disabled={exportDisabled}
      title="Export as PNG"
    >
      <svg viewBox="0 0 20 20" fill="currentColor">
        <path fill-rule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clip-rule="evenodd" />
      </svg>
      Export PNG
    </button>
  </div>
</div>

<style>
  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 16px;
    background: #ffffff;
    border-bottom: 1px solid #e9ecef;
    gap: 16px;
  }

  .toolbar-left,
  .toolbar-right {
    flex: 1;
    display: flex;
    align-items: center;
  }

  .toolbar-right {
    justify-content: flex-end;
  }

  .toolbar-center {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #4C78A8;
  }

  .logo {
    width: 24px;
    height: 24px;
  }

  .brand-text {
    font-weight: 600;
    font-size: 16px;
  }

  .toolbar-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    border: none;
    background: transparent;
    color: #495057;
    font-size: 13px;
    font-weight: 500;
    border-radius: 6px;
    cursor: pointer;
    transition: background-color 0.15s, color 0.15s;
  }

  .toolbar-btn:hover {
    background: #f1f3f5;
    color: #212529;
  }

  .toolbar-btn:active {
    background: #e9ecef;
  }

  .toolbar-btn svg {
    width: 16px;
    height: 16px;
  }

  .toolbar-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .toolbar-btn:disabled:hover {
    background: transparent;
    color: #495057;
  }

  .export-btn {
    background: #4C78A8;
    color: #ffffff;
  }

  .export-btn:hover {
    background: #3d6189;
    color: #ffffff;
  }

  .export-btn:active {
    background: #345578;
  }

  .export-btn:disabled {
    background: #4C78A8;
    color: #ffffff;
  }

  .toolbar-btn.active {
    background: #e7eef7;
    color: #345578;
  }

  .menu-anchor {
    position: relative;
  }

  .menu {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    min-width: 170px;
    padding: 4px;
    background: #ffffff;
    border: 1px solid #dee2e6;
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
    z-index: 30;
  }

  .menu-item {
    display: block;
    width: 100%;
    padding: 6px 10px;
    border: none;
    background: transparent;
    border-radius: 4px;
    text-align: left;
    font-size: 13px;
    color: #212529;
    cursor: pointer;
  }

  .menu-item:hover {
    background: #f1f3f5;
  }

  .toolbar-divider {
    width: 1px;
    height: 24px;
    background: #e9ecef;
    margin: 0 8px;
  }
</style>

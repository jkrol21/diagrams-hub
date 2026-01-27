<script lang="ts">
  interface Props {
    onnew: () => void;
    onopen: () => void;
    onsave: () => void;
    onsaveas: () => void;
  }

  let { onnew, onopen, onsave, onsaveas }: Props = $props();
</script>

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
  </div>

  <div class="toolbar-right">
    <!-- Placeholder for future theme/export buttons -->
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

  .toolbar-divider {
    width: 1px;
    height: 24px;
    background: #e9ecef;
    margin: 0 8px;
  }
</style>

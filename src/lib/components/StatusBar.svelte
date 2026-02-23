<script lang="ts">
  import type { SaveStatus } from '../types';
  import type { DiagramMode } from '../utils/diagramMode';

  interface Props {
    documentName: string;
    saveStatus: SaveStatus;
    lineCount: number;
    mode?: DiagramMode;
  }

  let { documentName, saveStatus, lineCount, mode = 'mermaid' }: Props = $props();

  const statusLabels: Record<SaveStatus, string> = {
    saved: 'Saved',
    unsaved: 'Unsaved changes',
    saving: 'Saving...',
    error: 'Save failed'
  };
</script>

<div class="status-bar">
  <div class="status-left">
    <span class="document-name" title={documentName}>
      {documentName || 'Untitled'}
    </span>
    <span class="separator">•</span>
    <span class="save-status" class:unsaved={saveStatus === 'unsaved'} class:error={saveStatus === 'error'}>
      {statusLabels[saveStatus]}
    </span>
  </div>
  <div class="status-right">
    <span class="mode-badge" class:excalidraw={mode === 'excalidraw'}>
      {mode === 'excalidraw' ? 'Excalidraw' : 'Mermaid'}
    </span>
    <span class="line-count">{lineCount} lines</span>
  </div>
</div>

<style>
  .status-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 14px;
    background: #f8f9fa;
    border-top: 1px solid #e9ecef;
    font-size: 12px;
    color: #6c757d;
  }

  .status-left {
    display: flex;
    align-items: center;
    gap: 8px;
    overflow: hidden;
  }

  .document-name {
    font-weight: 500;
    color: #495057;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 200px;
  }

  .separator {
    color: #adb5bd;
  }

  .save-status {
    color: #28a745;
  }

  .save-status.unsaved {
    color: #ffc107;
  }

  .save-status.error {
    color: #dc3545;
  }

  .status-right {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .line-count {
    color: #6c757d;
  }

  .mode-badge {
    font-size: 11px;
    font-weight: 500;
    padding: 2px 7px;
    border-radius: 10px;
    background: #e9f3ff;
    color: #3b71ca;
    letter-spacing: 0.02em;
  }

  .mode-badge.excalidraw {
    background: #fff3e0;
    color: #e07800;
  }
</style>

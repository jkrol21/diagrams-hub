<script lang="ts">
  import Toolbar from './lib/components/Toolbar.svelte';
  import Editor from './lib/components/Editor.svelte';
  import Preview from './lib/components/Preview.svelte';
  import SplitPane from './lib/components/SplitPane.svelte';
  import ErrorDisplay from './lib/components/ErrorDisplay.svelte';
  import StatusBar from './lib/components/StatusBar.svelte';

  import { diagramStore, code, documentName } from './lib/stores/diagram';
  import { uiStore } from './lib/stores/ui';
  import { openFile, saveDiagram, saveAs } from './lib/utils/fileSystem';
  import { exportToPng } from './lib/utils/exportPng';
  import type { DiagramDocument } from './lib/types';

  let error = $state<string | null>(null);
  let splitPosition = $state(50);
  let currentCode = $state('');
  let currentName = $state('Untitled');
  let saveStatus = $state<'saved' | 'unsaved' | 'saving' | 'error'>('saved');
  let lastRenderedSvg = $state<string | null>(null);

  // Subscribe to stores
  $effect(() => {
    const unsubCode = code.subscribe(c => currentCode = c);
    const unsubName = documentName.subscribe(n => currentName = n);
    const unsubStatus = diagramStore.saveStatus.subscribe(s => saveStatus = s);
    const unsubUI = uiStore.subscribe(ui => splitPosition = ui.splitPosition);

    return () => {
      unsubCode();
      unsubName();
      unsubStatus();
      unsubUI();
    };
  });

  function handleCodeChange(newCode: string) {
    diagramStore.updateCode(newCode);
  }

  function handleError(err: string | null) {
    error = err;
    if (err) {
      diagramStore.setErrors([err]);
    } else {
      diagramStore.clearErrors();
    }
  }

  function handleRender(svg: string) {
    lastRenderedSvg = svg;
  }

  function handleEditLabel(oldLabel: string, newLabel: string) {
    const doc = diagramStore.getDocument();
    const escaped = oldLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Replace the label inside any bracket type: [] () {}
    const newCode = doc.code.replace(
      new RegExp(`([\\[\\(\\{])\\s*${escaped}\\s*([\\]\\)\\}])`, 'g'),
      `$1${newLabel}$2`
    );
    if (newCode !== doc.code) {
      diagramStore.updateCode(newCode);
    }
  }

  function handleSplitChange(position: number) {
    uiStore.setSplitPosition(position);
  }

  function handleNew() {
    if (saveStatus === 'unsaved') {
      if (!confirm('You have unsaved changes. Create a new diagram anyway?')) {
        return;
      }
    }
    diagramStore.newDiagram();
  }

  async function handleOpen() {
    if (saveStatus === 'unsaved') {
      if (!confirm('You have unsaved changes. Open a different diagram anyway?')) {
        return;
      }
    }

    try {
      const result = await openFile();
      if (result) {
        const doc: DiagramDocument = {
          id: crypto.randomUUID(),
          name: result.name,
          code: result.content,
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
        diagramStore.loadDiagram(doc, result.handle);
      }
    } catch (err) {
      console.error('Failed to open file:', err);
      alert('Failed to open file. Please try again.');
    }
  }

  async function handleSave() {
    try {
      const doc = diagramStore.getDocument();
      const handle = diagramStore.getFileHandle();
      const result = await saveDiagram(doc, handle);

      if (result.success) {
        if (result.handle && result.handle !== handle) {
          diagramStore.setFileHandle(result.handle);
          const file = await result.handle.getFile();
          const name = file.name.replace(/\.(mmd|mermaid)$/, '');
          diagramStore.updateName(name);
        }
      }
    } catch (err) {
      console.error('Failed to save:', err);
      alert('Failed to save file. Please try again.');
    }
  }

  async function handleSaveAs() {
    try {
      const doc = diagramStore.getDocument();
      const handle = await saveAs(doc.code, doc.name);

      if (handle) {
        diagramStore.setFileHandle(handle);
        const file = await handle.getFile();
        const name = file.name.replace(/\.(mmd|mermaid)$/, '');
        diagramStore.updateName(name);
      }
    } catch (err) {
      console.error('Failed to save:', err);
      alert('Failed to save file. Please try again.');
    }
  }

  function handleExport() {
    if (lastRenderedSvg) {
      exportToPng(lastRenderedSvg, currentName, 2);
    }
  }

  // Calculate line count
  const lineCount = $derived(currentCode.split('\n').length);
</script>

<div class="app">
  <Toolbar
    onnew={handleNew}
    onopen={handleOpen}
    onsave={handleSave}
    onsaveas={handleSaveAs}
    onexport={handleExport}
    exportDisabled={!lastRenderedSvg}
  />

  <main class="main-content">
    <SplitPane
      position={splitPosition}
      onpositionchange={handleSplitChange}
    >
      {#snippet left()}
        <div class="editor-panel">
          <Editor value={currentCode} onchange={handleCodeChange} />
          <ErrorDisplay {error} />
        </div>
      {/snippet}

      {#snippet right()}
        <Preview
          code={currentCode}
          onerror={handleError}
          onrender={handleRender}
          oneditlabel={handleEditLabel}
        />
      {/snippet}
    </SplitPane>
  </main>

  <StatusBar
    documentName={currentName}
    {saveStatus}
    {lineCount}
  />
</div>

<style>
  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: 100vw;
    overflow: hidden;
    background: #ffffff;
  }

  .main-content {
    flex: 1;
    overflow: hidden;
  }

  .editor-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .editor-panel :global(.editor-container) {
    flex: 1;
  }
</style>

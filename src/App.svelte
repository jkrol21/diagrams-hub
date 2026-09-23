<script lang="ts">
  import Toolbar from './lib/components/Toolbar.svelte';
  import Editor from './lib/components/Editor.svelte';
  import Preview from './lib/components/Preview.svelte';
  import SplitPane from './lib/components/SplitPane.svelte';
  import ErrorDisplay from './lib/components/ErrorDisplay.svelte';
  import StatusBar from './lib/components/StatusBar.svelte';
  import ThemePanel from './lib/components/ThemePanel.svelte';

  import { diagramStore, code, documentName } from './lib/stores/diagram';
  import { uiStore } from './lib/stores/ui';
  import { themeStore } from './lib/stores/theme';
  import { openFile, saveDiagram, saveAs } from './lib/utils/fileSystem';
  import { exportToPng } from './lib/utils/exportPng';
  import { detectDiagramMode } from './lib/utils/diagramMode';
  import type { DiagramDocument } from './lib/types';
  import type { SourceRange } from './lib/utils/sourceMap';

  let error = $state<string | null>(null);
  let splitPosition = $state(50);
  let currentCode = $state('');
  let currentName = $state('Untitled');
  let saveStatus = $state<'saved' | 'unsaved' | 'saving' | 'error'>('saved');
  let lastRenderedSvg = $state<string | null>(null);
  let highlight = $state<SourceRange | null>(null);
  let styleOpen = $state(false);
  let exporting = $state(false);

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

  function handleSelect(range: SourceRange | null) {
    highlight = range;
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

  async function handleExport() {
    if (!lastRenderedSvg || exporting) return;
    exporting = true;
    try {
      await exportToPng(lastRenderedSvg, currentName, 2, themeStore.getTheme().colors.background);
    } catch (err) {
      console.error('PNG export failed:', err);
      alert(`PNG export failed: ${err instanceof Error ? err.message : err}`);
    } finally {
      exporting = false;
    }
  }

  function handleExample(name: string, exampleCode: string) {
    if (saveStatus === 'unsaved' && !confirm('You have unsaved changes. Load the example anyway?')) {
      return;
    }
    diagramStore.loadDiagram({
      id: crypto.randomUUID(),
      name,
      code: exampleCode,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
  }

  // Calculate line count
  const lineCount = $derived(currentCode.split('\n').length);
  const diagramMode = $derived(detectDiagramMode(currentCode));
</script>

<div class="app">
  <Toolbar
    onnew={handleNew}
    onopen={handleOpen}
    onsave={handleSave}
    onsaveas={handleSaveAs}
    onexport={handleExport}
    exportDisabled={!lastRenderedSvg || exporting}
    onexample={handleExample}
    onstyle={() => (styleOpen = !styleOpen)}
    {styleOpen}
  />

  <main class="main-content" class:with-panel={styleOpen}>
    <SplitPane
      position={splitPosition}
      onpositionchange={handleSplitChange}
    >
      {#snippet left()}
        <div class="editor-panel">
          <Editor value={currentCode} onchange={handleCodeChange} {highlight} />
          <ErrorDisplay {error} code={currentCode} />
        </div>
      {/snippet}

      {#snippet right()}
        <Preview
          code={currentCode}
          onerror={handleError}
          onrender={handleRender}
          oneditlabel={handleEditLabel}
          onselect={handleSelect}
        />
      {/snippet}
    </SplitPane>

    {#if styleOpen}
      <ThemePanel onclose={() => (styleOpen = false)} />
    {/if}
  </main>

  <StatusBar
    documentName={currentName}
    {saveStatus}
    {lineCount}
    mode={diagramMode}
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
    position: relative;
  }

  /* Keep the preview fully visible next to the style panel (300px) */
  .main-content.with-panel {
    padding-right: 300px;
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

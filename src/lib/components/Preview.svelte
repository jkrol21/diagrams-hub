<script lang="ts">
  import { onMount } from 'svelte';
  import { initializeMermaid, registerArchitectureIcons, renderDiagram, generateMermaidId } from '../utils/mermaidConfig';
  import { themeStore } from '../stores/theme';

  interface Props {
    code: string;
    onerror: (error: string | null) => void;
    onrender?: (svg: string) => void;
  }

  let { code, onerror, onrender }: Props = $props();

  let svgContent = $state('');
  let isLoading = $state(true);
  let renderTimeout: ReturnType<typeof setTimeout>;
  let previewContainer: HTMLDivElement;

  onMount(() => {
    // Initialize Mermaid with current theme
    initializeMermaid(themeStore.getTheme());

    // Register Lucide icons for architecture diagrams
    registerArchitectureIcons();

    // Subscribe to theme changes
    const unsubscribe = themeStore.subscribe((theme) => {
      initializeMermaid(theme);
      debouncedRender();
    });

    return () => {
      clearTimeout(renderTimeout);
      unsubscribe();
    };
  });

  function debouncedRender() {
    clearTimeout(renderTimeout);
    renderTimeout = setTimeout(render, 300);
  }

  async function render() {
    if (!code.trim()) {
      svgContent = '';
      onerror(null);
      isLoading = false;
      return;
    }

    isLoading = true;
    const elementId = generateMermaidId();

    try {
      const { svg, error } = await renderDiagram(code, elementId);

      if (error) {
        onerror(error);
        svgContent = '';
      } else {
        onerror(null);
        svgContent = svg;
        onrender?.(svg);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Rendering failed';
      onerror(message);
      svgContent = '';
    }

    isLoading = false;
  }

  // Re-render when code changes
  $effect(() => {
    code; // Track dependency
    debouncedRender();
  });
</script>

<div class="preview-container" bind:this={previewContainer}>
  {#if isLoading && !svgContent}
    <div class="loading">
      <span class="spinner"></span>
      Rendering...
    </div>
  {:else if svgContent}
    <div class="diagram-wrapper">
      {@html svgContent}
    </div>
  {:else}
    <div class="empty-state">
      <p>Enter Mermaid code to see the preview</p>
    </div>
  {/if}
</div>

<style>
  .preview-container {
    height: 100%;
    width: 100%;
    overflow: auto;
    background: var(--preview-bg, #ffffff);
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 24px;
  }

  .diagram-wrapper {
    max-width: 100%;
    display: flex;
    justify-content: center;
  }

  .diagram-wrapper :global(svg) {
    max-width: 100%;
    height: auto;
  }

  .loading {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #6c757d;
    font-size: 14px;
  }

  .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid #e9ecef;
    border-top-color: #4C78A8;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .empty-state {
    color: #adb5bd;
    font-size: 14px;
    text-align: center;
    padding: 40px;
  }
</style>

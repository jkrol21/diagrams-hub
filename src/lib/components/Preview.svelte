<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { initializeMermaid, registerArchitectureIcons, renderDiagram, generateMermaidId } from '../utils/mermaidConfig';
  import { renderExcalidraw } from '../utils/excalidrawRender';
  import { detectDiagramMode } from '../utils/diagramMode';
  import { themeStore } from '../stores/theme';
  import { svgSize, normalizeSvgSize } from '../utils/svg';
  import { resolveTheme } from '../utils/looks';
  import { applyLook } from '../utils/applyLook';
  import { fontsReady } from '../utils/fonts';
  import type { ThemeConfig } from '../types';
  import { locateMermaidElement, locateExcalidrawElement, type SourceRange } from '../utils/sourceMap';

  interface Props {
    code: string;
    onerror: (error: string | null) => void;
    /** Rendered SVG (with the look applied) and the background to export it on */
    onrender?: (svg: string, background: string) => void;
    oneditlabel?: (oldLabel: string, newLabel: string) => void;
    /** Called with the source range of a clicked element (null = nothing found) */
    onselect?: (range: SourceRange | null) => void;
  }

  let { code, onerror, onrender, oneditlabel, onselect }: Props = $props();

  let svgContent = $state('');
  let isLoading = $state(true);
  let renderTimeout: ReturnType<typeof setTimeout>;

  // Canvas refs (bound via bind:this)
  let container = $state<HTMLDivElement>(undefined!);
  let canvasEl = $state<HTMLDivElement>(undefined!);

  // Pan & zoom state
  let zoom = $state(1);
  let panX = $state(0);
  let panY = $state(0);
  let isPanning = $state(false);
  let dragStartX = 0;
  let dragStartY = 0;
  let dragStartPanX = 0;
  let dragStartPanY = 0;
  let didDrag = false;
  let hasFitted = false;
  // Keep fitting the diagram to the view until the user zooms or pans themselves
  let autoFit = true;
  let lastKind = '';
  let lastSize = { width: 0, height: 0 };
  let baseTheme: ThemeConfig = themeStore.getTheme();
  let canvasBackground = $state(baseTheme.colors.background);

  const MIN_ZOOM = 0.05;
  const MAX_ZOOM = 10;
  const MAX_FIT_ZOOM = 2;

  // Inline text editing state
  let editingText = $state<string | null>(null);
  let editInput = $state('');
  let editPos = $state({ x: 0, y: 0, width: 100, height: 28, fontSize: 14 });
  let editInputEl = $state<HTMLInputElement>(undefined!);

  onMount(() => {
    initializeMermaid(themeStore.getTheme());
    registerArchitectureIcons();

    const unsubscribe = themeStore.subscribe((theme) => {
      baseTheme = theme;
      debouncedRender();
    });

    const resizeObserver = new ResizeObserver(() => {
      if (autoFit && svgContent) fitToView();
    });
    resizeObserver.observe(container);

    return () => {
      clearTimeout(renderTimeout);
      unsubscribe();
      resizeObserver.disconnect();
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
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
    const mode = detectDiagramMode(code);
    // `%% style:` / `%% palette:` in the code win over the Style panel
    const theme = resolveTheme(baseTheme, code);
    canvasBackground = theme.colors.background;

    try {
      await fontsReady();
      if (mode === 'mermaid') initializeMermaid(theme);
      let svg: string;
      let error: string | null;

      if (mode === 'excalidraw') {
        ({ svg, error } = await renderExcalidraw(code, { embedFont: true }));
      } else {
        ({ svg, error } = await renderDiagram(code, generateMermaidId()));
      }

      if (error) {
        onerror(error);
        svgContent = '';
      } else {
        onerror(null);
        svg = normalizeSvgSize(svg);
        svgContent = svg;
        await tick();

        const svgEl = canvasEl?.querySelector('svg');
        if (svgEl && mode === 'mermaid' && theme.look) {
          applyLook(svgEl, theme.look);
          svg = new XMLSerializer().serializeToString(svgEl);
        }
        onrender?.(svg, theme.colors.background);

        // Refit on first render, while auto-fitting, or when a different
        // diagram was loaded/pasted (other type or very different size)
        const kind = diagramKind(code);
        const size = currentSvgSize();
        const ratio = lastSize.width ? (size.width * size.height) / (lastSize.width * lastSize.height) : 1;
        if (!hasFitted || autoFit || kind !== lastKind || ratio > 3 || ratio < 1 / 3) {
          hasFitted = true;
          fitToView();
        }
        lastKind = kind;
        lastSize = size;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Rendering failed';
      onerror(message);
      svgContent = '';
    }

    isLoading = false;
  }

  /** First keyword of the source, e.g. "classDiagram" or "excalidraw" */
  function diagramKind(source: string): string {
    if (detectDiagramMode(source) === 'excalidraw') return 'excalidraw';
    const line = source.split('\n').find((l) => l.trim() && !l.trim().startsWith('%%'));
    return line?.trim().split(/\s+/)[0] ?? '';
  }

  function currentSvgSize(): { width: number; height: number } {
    const svg = canvasEl?.querySelector('svg');
    return svg ? svgSize(svg) : { width: 0, height: 0 };
  }

  // ── Pan & Zoom ──────────────────────────────────────────────

  function setZoomAt(newZoom: number, cx: number, cy: number) {
    newZoom = Math.min(Math.max(newZoom, MIN_ZOOM), MAX_ZOOM);
    panX = cx - (cx - panX) * (newZoom / zoom);
    panY = cy - (cy - panY) * (newZoom / zoom);
    zoom = newZoom;
    autoFit = false;
  }

  function handleWheel(e: WheelEvent) {
    e.preventDefault();
    // Proportional to the scroll distance: smooth for trackpads/pinch
    // (ctrlKey), about 12% per notch for mouse wheels
    const pixels = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1);
    const factor = Math.exp(-pixels * (e.ctrlKey ? 0.01 : 0.0012));

    // Zoom toward cursor position
    const rect = container.getBoundingClientRect();
    setZoomAt(zoom * factor, e.clientX - rect.left, e.clientY - rect.top);
  }

  function handleMouseDown(e: MouseEvent) {
    if (e.button !== 0) return;
    // Don't pan when clicking edit overlay
    if ((e.target as HTMLElement).closest('.edit-overlay')) return;

    isPanning = true;
    didDrag = false;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragStartPanX = panX;
    dragStartPanY = panY;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }

  function handleMouseMove(e: MouseEvent) {
    if (!isPanning) return;
    if (Math.abs(e.clientX - dragStartX) + Math.abs(e.clientY - dragStartY) > 3) {
      didDrag = true;
      autoFit = false;
    }
    panX = dragStartPanX + (e.clientX - dragStartX);
    panY = dragStartPanY + (e.clientY - dragStartY);
  }

  function handleMouseUp() {
    isPanning = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  }

  function fitToView() {
    if (!container || !canvasEl) return;
    const { width: svgW, height: svgH } = currentSvgSize();
    if (!svgW || !svgH) return;

    const containerRect = container.getBoundingClientRect();
    const padding = 48;
    const availW = Math.max(containerRect.width - padding * 2, 50);
    const availH = Math.max(containerRect.height - padding * 2, 50);

    zoom = Math.min(availW / svgW, availH / svgH, MAX_FIT_ZOOM);
    panX = (containerRect.width - svgW * zoom) / 2;
    panY = (containerRect.height - svgH * zoom) / 2;
    autoFit = true;
  }

  function zoomIn() {
    zoomBy(1.25);
  }

  function zoomOut() {
    zoomBy(0.8);
  }

  function zoomBy(factor: number) {
    const rect = container.getBoundingClientRect();
    setZoomAt(zoom * factor, rect.width / 2, rect.height / 2);
  }

  /** 100% = the diagram's natural size, centered on the view center */
  function actualSize() {
    const rect = container.getBoundingClientRect();
    setZoomAt(1, rect.width / 2, rect.height / 2);
  }

  // ── Click to highlight source ───────────────────────────────

  function clearSelectionMark() {
    canvasEl?.querySelectorAll('.dh-selected').forEach((el) => el.classList.remove('dh-selected'));
  }

  /**
   * Group backgrounds and stroke-only icons are unfilled, so clicks inside them
   * hit the SVG background: use geometry, preferring the smallest element
   * (a service/node) over the group around it.
   */
  function locateEnclosingGroup(svgRoot: Element, x: number, y: number) {
    let best: { el: Element; area: number } | null = null;
    for (const el of svgRoot.querySelectorAll('.architecture-service, g.node, [id^="group-"], g.cluster')) {
      const r = el.getBoundingClientRect();
      const area = r.width * r.height;
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom && (!best || area < best.area)) {
        best = { el, area };
      }
    }
    return best ? locateMermaidElement(code, best.el, svgRoot) : null;
  }

  function handleClick(e: MouseEvent) {
    if (!onselect || didDrag) return;
    if ((e.target as HTMLElement).closest('.edit-overlay, .zoom-controls')) return;

    clearSelectionMark();
    const svgRoot = canvasEl?.querySelector('svg');
    const target = e.target as Element;
    if (!svgRoot || !svgRoot.contains(target)) {
      onselect(null);
      return;
    }

    let range: SourceRange | null = null;
    let element: Element | null = null;

    if (detectDiagramMode(code) === 'excalidraw') {
      element = target.closest('[data-el-index]');
      const index = Number(element?.getAttribute('data-el-index'));
      if (element && !Number.isNaN(index)) range = locateExcalidrawElement(code, index);
    } else {
      const hit = locateMermaidElement(code, target, svgRoot)
        ?? locateEnclosingGroup(svgRoot, e.clientX, e.clientY);
      if (hit) ({ range, element } = hit);
    }

    if (range && element) element.classList.add('dh-selected');
    onselect(range);
  }

  // ── Inline text editing ─────────────────────────────────────

  function handleDblClick(e: MouseEvent) {
    const target = e.target as Element;
    if (target === container || target === canvasEl?.querySelector('svg')) {
      fitToView();
      return;
    }
    if (!oneditlabel) return;

    const textEl = target.closest('text') || (target.tagName.toLowerCase() === 'tspan' ? target.parentElement?.closest('text') : null);
    if (!textEl) return;

    const text = textEl.textContent?.trim();
    if (!text) return;

    // Only allow editing labels that appear in source brackets
    const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!new RegExp(`[\\[\\(\\{]\\s*${escaped}\\s*[\\]\\)\\}]`).test(code)) return;

    const textRect = textEl.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    editingText = text;
    editInput = text;
    editPos = {
      x: textRect.left - containerRect.left,
      y: textRect.top - containerRect.top,
      width: Math.max(textRect.width + 24, 120),
      height: textRect.height + 10,
      fontSize: parseFloat(getComputedStyle(textEl).fontSize) || 14
    };

    tick().then(() => {
      editInputEl?.focus();
      editInputEl?.select();
    });
  }

  function commitEdit() {
    if (editingText !== null && editInput.trim() && editInput.trim() !== editingText) {
      oneditlabel?.(editingText, editInput.trim());
    }
    editingText = null;
  }

  function cancelEdit() {
    editingText = null;
  }

  function handleEditKeydown(e: KeyboardEvent) {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      commitEdit();
    } else if (e.key === 'Escape') {
      cancelEdit();
    }
  }

  // Re-render when code changes
  $effect(() => {
    code;
    debouncedRender();
  });

  const zoomPercent = $derived(Math.round(zoom * 100));
</script>

<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
<div
  class="preview-container"
  class:panning={isPanning}
  bind:this={container}
  onwheel={handleWheel}
  onmousedown={handleMouseDown}
  onclick={handleClick}
  ondblclick={handleDblClick}
  style="
    background-position: {panX}px {panY}px;
    background-size: {20 * zoom}px {20 * zoom}px;
  "
>
  {#if isLoading && !svgContent}
    <div class="loading">
      <span class="spinner"></span>
      Rendering...
    </div>
  {:else if svgContent}
    <div
      class="canvas"
      bind:this={canvasEl}
      style="transform: translate({panX}px, {panY}px) scale({zoom}); background: {canvasBackground};"
    >
      {@html svgContent}
    </div>
  {:else}
    <div class="empty-state">
      <p>Enter Mermaid or Excalidraw JSON to see the preview</p>
    </div>
  {/if}

  <!-- Edit overlay -->
  {#if editingText !== null}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="edit-overlay"
      style="left: {editPos.x}px; top: {editPos.y}px;"
      onmousedown={(e) => e.stopPropagation()}
    >
      <input
        bind:this={editInputEl}
        bind:value={editInput}
        onblur={commitEdit}
        onkeydown={handleEditKeydown}
        style="
          font-size: {editPos.fontSize}px;
          min-width: {editPos.width}px;
          height: {editPos.height}px;
        "
      />
    </div>
  {/if}

  <!-- Zoom controls -->
  {#if svgContent}
    <div class="zoom-controls">
      <button class="zoom-btn" onclick={zoomOut} title="Zoom out">
        <svg viewBox="0 0 16 16" fill="currentColor" width="14" height="14">
          <path d="M3.5 8a.5.5 0 0 1 .5-.5h8a.5.5 0 0 1 0 1H4a.5.5 0 0 1-.5-.5z"/>
        </svg>
      </button>
      <button class="zoom-btn zoom-level" onclick={actualSize} title="Actual size (100%)">
        {zoomPercent}%
      </button>
      <button class="zoom-btn" onclick={zoomIn} title="Zoom in">
        <svg viewBox="0 0 16 16" fill="currentColor" width="14" height="14">
          <path d="M8 3.5a.5.5 0 0 1 .5.5v3.5H12a.5.5 0 0 1 0 1H8.5V12a.5.5 0 0 1-1 0V8.5H4a.5.5 0 0 1 0-1h3.5V4a.5.5 0 0 1 .5-.5z"/>
        </svg>
      </button>
      <button class="zoom-btn" onclick={fitToView} title="Fit to view (or double-click the background)">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" width="14" height="14">
          <path d="M2 5.5V3a1 1 0 0 1 1-1h2.5M10.5 2H13a1 1 0 0 1 1 1v2.5M14 10.5V13a1 1 0 0 1-1 1h-2.5M5.5 14H3a1 1 0 0 1-1-1v-2.5"/>
        </svg>
      </button>
    </div>
  {/if}
</div>

<style>
  .preview-container {
    height: 100%;
    width: 100%;
    overflow: hidden;
    position: relative;
    background-color: #f8f9fa;
    background-image: radial-gradient(circle, #dee2e6 1px, transparent 1px);
    cursor: grab;
    user-select: none;
  }

  .preview-container.panning {
    cursor: grabbing;
  }

  .canvas {
    box-shadow: 0 1px 6px rgba(0, 0, 0, 0.08);
    transform-origin: 0 0;
    position: absolute;
    top: 0;
    left: 0;
  }

  .canvas :global(svg) {
    max-width: none !important;
    display: block;
  }

  .canvas :global(.dh-selected) {
    filter: drop-shadow(0 0 3px #f59f00) drop-shadow(0 0 1px #f59f00);
  }

  .canvas :global(svg text) {
    pointer-events: auto;
    cursor: text;
  }

  /* ── Edit overlay ───────────────────────────────── */

  .edit-overlay {
    position: absolute;
    z-index: 10;
  }

  .edit-overlay input {
    border: 2px solid #4C78A8;
    border-radius: 4px;
    padding: 2px 8px;
    background: #ffffff;
    color: #212529;
    font-family: inherit;
    outline: none;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  }

  /* ── Loading / empty ────────────────────────────── */

  .loading {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
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
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    color: #adb5bd;
    font-size: 14px;
    text-align: center;
  }

  /* ── Zoom controls ──────────────────────────────── */

  .zoom-controls {
    position: absolute;
    bottom: 16px;
    right: 16px;
    display: flex;
    align-items: center;
    gap: 2px;
    background: #ffffff;
    border: 1px solid #dee2e6;
    border-radius: 8px;
    padding: 4px;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
    z-index: 5;
    user-select: none;
  }

  .zoom-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: transparent;
    color: #495057;
    cursor: pointer;
    border-radius: 4px;
    padding: 4px 8px;
    font-size: 12px;
    font-weight: 500;
    min-width: 28px;
    height: 28px;
    transition: background-color 0.1s;
  }

  .zoom-btn:hover {
    background: #f1f3f5;
    color: #212529;
  }

  .zoom-btn:active {
    background: #e9ecef;
  }

  .zoom-level {
    min-width: 48px;
    font-variant-numeric: tabular-nums;
  }
</style>

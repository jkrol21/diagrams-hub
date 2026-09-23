<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { initializeMermaid, registerArchitectureIcons, renderDiagram, generateMermaidId } from '../utils/mermaidConfig';
  import { renderExcalidraw } from '../utils/excalidrawRender';
  import { detectDiagramMode } from '../utils/diagramMode';
  import { themeStore } from '../stores/theme';
  import { locateMermaidElement, locateExcalidrawElement, type SourceRange } from '../utils/sourceMap';

  interface Props {
    code: string;
    onerror: (error: string | null) => void;
    onrender?: (svg: string) => void;
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

  // Inline text editing state
  let editingText = $state<string | null>(null);
  let editInput = $state('');
  let editPos = $state({ x: 0, y: 0, width: 100, height: 28, fontSize: 14 });
  let editInputEl = $state<HTMLInputElement>(undefined!);

  onMount(() => {
    initializeMermaid(themeStore.getTheme());
    registerArchitectureIcons();

    const unsubscribe = themeStore.subscribe((theme) => {
      initializeMermaid(theme);
      debouncedRender();
    });

    return () => {
      clearTimeout(renderTimeout);
      unsubscribe();
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

    try {
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
        svgContent = svg;
        onrender?.(svg);
        if (!hasFitted) {
          hasFitted = true;
          await tick();
          fitToView();
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Rendering failed';
      onerror(message);
      svgContent = '';
    }

    isLoading = false;
  }

  // ── Pan & Zoom ──────────────────────────────────────────────

  function handleWheel(e: WheelEvent) {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.92 : 1.08;
    const newZoom = Math.min(Math.max(zoom * factor, 0.1), 5);

    // Zoom toward cursor position
    const rect = container.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    panX = cx - (cx - panX) * (newZoom / zoom);
    panY = cy - (cy - panY) * (newZoom / zoom);
    zoom = newZoom;
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
    if (Math.abs(e.clientX - dragStartX) + Math.abs(e.clientY - dragStartY) > 3) didDrag = true;
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
    const svg = canvasEl.querySelector('svg');
    if (!svg) return;

    const containerRect = container.getBoundingClientRect();

    // Get SVG natural dimensions
    const vb = (svg as SVGSVGElement).viewBox?.baseVal;
    let svgW: number, svgH: number;
    if (vb && vb.width > 0 && vb.height > 0) {
      svgW = vb.width;
      svgH = vb.height;
    } else {
      svgW = parseFloat(svg.getAttribute('width') || '0') || 800;
      svgH = parseFloat(svg.getAttribute('height') || '0') || 600;
    }

    const padding = 48;
    const availW = containerRect.width - padding * 2;
    const availH = containerRect.height - padding * 2;

    zoom = Math.min(availW / svgW, availH / svgH, 2);
    panX = (containerRect.width - svgW * zoom) / 2;
    panY = (containerRect.height - svgH * zoom) / 2;
  }

  function zoomIn() {
    zoomBy(1.25);
  }

  function zoomOut() {
    zoomBy(0.8);
  }

  function zoomBy(factor: number) {
    const rect = container.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const newZoom = Math.min(Math.max(zoom * factor, 0.1), 5);
    panX = cx - (cx - panX) * (newZoom / zoom);
    panY = cy - (cy - panY) * (newZoom / zoom);
    zoom = newZoom;
  }

  // ── Click to highlight source ───────────────────────────────

  function clearSelectionMark() {
    canvasEl?.querySelectorAll('.dh-selected').forEach((el) => el.classList.remove('dh-selected'));
  }

  /** Group/subgraph backgrounds are unfilled, so clicks inside them hit nothing: use geometry */
  function locateEnclosingGroup(svgRoot: Element, x: number, y: number) {
    let best: { el: Element; area: number } | null = null;
    for (const el of svgRoot.querySelectorAll('[id^="group-"], g.cluster')) {
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
    if (!oneditlabel) return;

    const target = e.target as Element;
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
      style="transform: translate({panX}px, {panY}px) scale({zoom})"
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
      <button class="zoom-btn zoom-level" onclick={fitToView} title="Fit to view">
        {zoomPercent}%
      </button>
      <button class="zoom-btn" onclick={zoomIn} title="Zoom in">
        <svg viewBox="0 0 16 16" fill="currentColor" width="14" height="14">
          <path d="M8 3.5a.5.5 0 0 1 .5.5v3.5H12a.5.5 0 0 1 0 1H8.5V12a.5.5 0 0 1-1 0V8.5H4a.5.5 0 0 1 0-1h3.5V4a.5.5 0 0 1 .5-.5z"/>
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

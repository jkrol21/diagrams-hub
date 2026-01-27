<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    position: number;
    onpositionchange: (position: number) => void;
    left: Snippet;
    right: Snippet;
  }

  let { position, onpositionchange, left, right }: Props = $props();

  let container: HTMLDivElement;
  let isDragging = $state(false);

  function startDrag(e: MouseEvent) {
    e.preventDefault();
    isDragging = true;

    const onMouseMove = (e: MouseEvent) => {
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const newPosition = ((e.clientX - rect.left) / rect.width) * 100;
      onpositionchange(Math.max(20, Math.min(80, newPosition)));
    };

    const onMouseUp = () => {
      isDragging = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }
</script>

<div class="split-pane" bind:this={container} class:dragging={isDragging}>
  <div class="pane left-pane" style="width: {position}%">
    {@render left()}
  </div>

  <!-- svelte-ignore a11y_no_noninteractive_tabindex a11y_no_noninteractive_element_interactions -->
  <div
    class="divider"
    onmousedown={startDrag}
    role="separator"
    aria-orientation="vertical"
    aria-valuenow={position}
    aria-valuemin={20}
    aria-valuemax={80}
  >
    <div class="divider-handle"></div>
  </div>

  <div class="pane right-pane" style="width: {100 - position}%">
    {@render right()}
  </div>
</div>

<style>
  .split-pane {
    display: flex;
    height: 100%;
    width: 100%;
    overflow: hidden;
  }

  .pane {
    height: 100%;
    overflow: hidden;
    min-width: 0;
  }

  .divider {
    width: 8px;
    background: #e9ecef;
    cursor: col-resize;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: background-color 0.15s;
  }

  .divider:hover,
  .dragging .divider {
    background: #dee2e6;
  }

  .divider-handle {
    width: 4px;
    height: 40px;
    background: #adb5bd;
    border-radius: 2px;
    transition: background-color 0.15s;
  }

  .divider:hover .divider-handle,
  .dragging .divider-handle {
    background: #6c757d;
  }

  .split-pane.dragging {
    cursor: col-resize;
  }

  .dragging .pane {
    pointer-events: none;
  }
</style>

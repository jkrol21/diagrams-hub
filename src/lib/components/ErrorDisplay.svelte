<script lang="ts">
  interface Props {
    error: string | null;
  }

  let { error }: Props = $props();
</script>

{#if error}
  <div class="error-display">
    <svg class="error-icon" viewBox="0 0 20 20" fill="currentColor">
      <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
    </svg>
    <span class="error-text">{error}</span>
  </div>
{/if}

<style>
  .error-display {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    background: #fff5f5;
    border-top: 1px solid #feb2b2;
    color: #c53030;
    font-size: 13px;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
  }

  .error-icon {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
  }

  .error-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>

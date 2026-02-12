<script lang="ts">
  interface Props {
    error: string | null;
    code?: string;
  }

  let { error, code = '' }: Props = $props();
  let copied = $state(false);

  function buildCopyText(): string {
    const lines = [
      'My Mermaid architecture-beta diagram has a syntax error.',
      '',
      'Error:',
      error,
      '',
      'Here is my code:',
      '```',
      code,
      '```',
      '',
      'Please fix the syntax error and return only the corrected code.',
    ];
    return lines.join('\n');
  }

  async function copyForLLM() {
    try {
      await navigator.clipboard.writeText(buildCopyText());
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = buildCopyText();
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    }
  }
</script>

{#if error}
  <div class="error-display">
    <div class="error-header">
      <svg class="error-icon" viewBox="0 0 20 20" fill="currentColor">
        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
      </svg>
      <span class="error-label">Syntax Error</span>
      <button class="copy-btn" onclick={copyForLLM} title="Copy error + code for LLM">
        {#if copied}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          Copied
        {:else}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
          Copy for LLM
        {/if}
      </button>
    </div>
    <pre class="error-text">{error}</pre>
  </div>
{/if}

<style>
  .error-display {
    padding: 10px 14px;
    background: #fff5f5;
    border-top: 1px solid #feb2b2;
    color: #c53030;
    font-size: 13px;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    max-height: 120px;
    overflow-y: auto;
  }

  .error-header {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .error-icon {
    width: 15px;
    height: 15px;
    flex-shrink: 0;
  }

  .error-label {
    font-weight: 600;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .copy-btn {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 3px 10px;
    background: #c530301a;
    border: 1px solid #feb2b2;
    border-radius: 4px;
    color: #c53030;
    font-size: 11px;
    font-family: inherit;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.15s;
  }

  .copy-btn:hover {
    background: #c5303030;
  }

  .copy-btn svg {
    width: 13px;
    height: 13px;
    flex-shrink: 0;
  }

  .error-text {
    margin: 6px 0 0;
    padding: 0;
    font-size: 12px;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
    color: #9b2c2c;
  }
</style>

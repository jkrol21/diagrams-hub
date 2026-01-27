<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { EditorState } from '@codemirror/state';
  import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from '@codemirror/view';
  import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
  import { syntaxHighlighting, defaultHighlightStyle, bracketMatching } from '@codemirror/language';
  import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';

  interface Props {
    value: string;
    onchange: (value: string) => void;
  }

  let { value, onchange }: Props = $props();

  let container: HTMLDivElement;
  let view: EditorView;

  // Light theme for the editor
  const lightTheme = EditorView.theme({
    '&': {
      height: '100%',
      fontSize: '14px'
    },
    '.cm-scroller': {
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
      overflow: 'auto'
    },
    '.cm-content': {
      padding: '12px 0'
    },
    '.cm-gutters': {
      backgroundColor: '#f8f9fa',
      borderRight: '1px solid #e9ecef',
      color: '#6c757d'
    },
    '.cm-activeLineGutter': {
      backgroundColor: '#e9ecef'
    },
    '.cm-activeLine': {
      backgroundColor: '#f1f3f4'
    },
    '.cm-line': {
      padding: '0 12px'
    }
  });

  onMount(() => {
    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onchange(update.state.doc.toString());
      }
    });

    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        history(),
        bracketMatching(),
        highlightSelectionMatches(),
        syntaxHighlighting(defaultHighlightStyle),
        keymap.of([
          ...defaultKeymap,
          ...historyKeymap,
          ...searchKeymap
        ]),
        lightTheme,
        updateListener,
        EditorView.lineWrapping
      ]
    });

    view = new EditorView({
      state,
      parent: container
    });
  });

  onDestroy(() => {
    view?.destroy();
  });

  // Update editor content when value prop changes externally
  $effect(() => {
    if (view && value !== view.state.doc.toString()) {
      view.dispatch({
        changes: {
          from: 0,
          to: view.state.doc.length,
          insert: value
        }
      });
    }
  });
</script>

<div class="editor-container" bind:this={container}></div>

<style>
  .editor-container {
    height: 100%;
    width: 100%;
    overflow: hidden;
  }

  .editor-container :global(.cm-editor) {
    height: 100%;
  }

  .editor-container :global(.cm-focused) {
    outline: none;
  }
</style>

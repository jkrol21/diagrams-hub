<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { EditorState, StateEffect, StateField } from '@codemirror/state';
  import { EditorView, Decoration, type DecorationSet, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from '@codemirror/view';
  import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
  import { syntaxHighlighting, defaultHighlightStyle, bracketMatching } from '@codemirror/language';
  import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
  import type { SourceRange } from '../utils/sourceMap';

  interface Props {
    value: string;
    onchange: (value: string) => void;
    /** Source range of the element selected in the preview (new object = new highlight) */
    highlight?: SourceRange | null;
  }

  let { value, onchange, highlight = null }: Props = $props();

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
    },
    '.cm-line.cm-diagram-highlight': {
      backgroundColor: '#fff3bf',
      boxShadow: 'inset 3px 0 0 #f59f00'
    },
    '.cm-diagram-highlight-token': {
      backgroundColor: '#ffd43b',
      borderRadius: '2px'
    }
  });

  // ── Diagram selection highlight ──────────────────────────────
  // Line background for the definition block plus a mark on the exact token.
  // Decorations map through edits, so the highlight stays while typing there.

  const setHighlight = StateEffect.define<SourceRange | null>();

  const highlightLine = Decoration.line({ class: 'cm-diagram-highlight' });
  const highlightMark = Decoration.mark({ class: 'cm-diagram-highlight-token' });

  const highlightField = StateField.define<DecorationSet>({
    create: () => Decoration.none,
    update(deco, tr) {
      deco = deco.map(tr.changes);
      for (const effect of tr.effects) {
        if (!effect.is(setHighlight)) continue;
        const range = effect.value;
        if (!range) {
          deco = Decoration.none;
          continue;
        }
        const doc = tr.state.doc;
        const decos = [];
        const first = doc.lineAt(Math.min(range.blockFrom, doc.length)).number;
        const last = doc.lineAt(Math.min(range.blockTo, doc.length)).number;
        for (let n = first; n <= last; n++) decos.push(highlightLine.range(doc.line(n).from));
        if (range.to > range.from && range.to <= doc.length) {
          decos.push(highlightMark.range(range.from, range.to));
        }
        deco = Decoration.set(decos, true);
      }
      return deco;
    },
    provide: (f) => EditorView.decorations.from(f)
  });

  function applyHighlight(range: SourceRange | null) {
    if (!view) return;
    if (!range || range.to > view.state.doc.length) {
      view.dispatch({ effects: setHighlight.of(null) });
      return;
    }
    view.dispatch({
      selection: { anchor: range.from, head: range.to },
      effects: [
        setHighlight.of(range),
        EditorView.scrollIntoView(range.from, { y: 'center' })
      ]
    });
    view.focus();
  }

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
        highlightField,
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

  $effect(() => {
    applyHighlight(highlight);
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

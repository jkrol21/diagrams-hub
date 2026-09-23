import { writable, derived, get } from 'svelte/store';
import type { DiagramDocument, SaveStatus } from '../types';
import { saveToLocalStorage, loadFromLocalStorage } from '../utils/localStorage';
import defaultCode from '../../../examples/architecture.mmd?raw';

const STORAGE_KEY = 'mermaid-editor:active';

// Default template: the architecture example (examples/architecture.mmd)
const DEFAULT_CODE = defaultCode.trimEnd();

function createDiagramStore() {
  const stored = loadFromLocalStorage<DiagramDocument>(STORAGE_KEY);

  const initialDocument: DiagramDocument = stored || {
    id: crypto.randomUUID(),
    name: 'Untitled',
    code: DEFAULT_CODE,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  const document = writable<DiagramDocument>(initialDocument);
  const saveStatus = writable<SaveStatus>('saved');
  const errors = writable<string[]>([]);
  const fileHandle = writable<FileSystemFileHandle | null>(null);

  // Auto-save to localStorage on changes
  let saveTimeout: ReturnType<typeof setTimeout>;
  document.subscribe((doc) => {
    clearTimeout(saveTimeout);
    saveStatus.set('unsaved');
    saveTimeout = setTimeout(() => {
      saveToLocalStorage(STORAGE_KEY, doc);
      saveStatus.set('saved');
    }, 500);
  });

  return {
    document,
    saveStatus,
    errors,
    fileHandle,

    /** Update the diagram code */
    updateCode(code: string) {
      document.update(doc => ({
        ...doc,
        code,
        updatedAt: Date.now()
      }));
    },

    /** Update the document name */
    updateName(name: string) {
      document.update(doc => ({
        ...doc,
        name,
        updatedAt: Date.now()
      }));
    },

    /** Set parsing errors from Mermaid */
    setErrors(errs: string[]) {
      errors.set(errs);
    },

    /** Clear errors */
    clearErrors() {
      errors.set([]);
    },

    /** Create a new empty diagram */
    newDiagram() {
      document.set({
        id: crypto.randomUUID(),
        name: 'Untitled',
        code: DEFAULT_CODE,
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
      fileHandle.set(null);
      errors.set([]);
    },

    /** Load a diagram from an object */
    loadDiagram(doc: DiagramDocument, handle?: FileSystemFileHandle) {
      document.set(doc);
      if (handle) fileHandle.set(handle);
      errors.set([]);
    },

    /** Set the file handle for save operations */
    setFileHandle(handle: FileSystemFileHandle | null) {
      fileHandle.set(handle);
    },

    /** Get current document */
    getDocument(): DiagramDocument {
      return get(document);
    },

    /** Get current file handle */
    getFileHandle(): FileSystemFileHandle | null {
      return get(fileHandle);
    }
  };
}

export const diagramStore = createDiagramStore();

// Derived store for just the code (convenience)
export const code = derived(diagramStore.document, $doc => $doc.code);
export const documentName = derived(diagramStore.document, $doc => $doc.name);

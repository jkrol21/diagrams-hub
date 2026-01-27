import type { DiagramDocument } from '../types';

/** Check if File System Access API is supported */
export function isFileSystemSupported(): boolean {
  return 'showOpenFilePicker' in window && 'showSaveFilePicker' in window;
}

/** File picker options for .mmd files */
const FILE_PICKER_OPTIONS: FilePickerOptions = {
  types: [
    {
      description: 'Mermaid Diagram',
      accept: { 'text/plain': ['.mmd', '.mermaid'] }
    }
  ]
};

/** Open a .mmd file from disk */
export async function openFile(): Promise<{ content: string; name: string; handle: FileSystemFileHandle } | null> {
  if (!isFileSystemSupported()) {
    return openFileFallback();
  }

  try {
    const [fileHandle] = await window.showOpenFilePicker(FILE_PICKER_OPTIONS);
    const file = await fileHandle.getFile();
    const content = await file.text();
    const name = file.name.replace(/\.(mmd|mermaid)$/, '');

    return { content, name, handle: fileHandle };
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      return null; // User cancelled
    }
    throw error;
  }
}

/** Fallback file open for unsupported browsers */
function openFileFallback(): Promise<{ content: string; name: string; handle: FileSystemFileHandle } | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.mmd,.mermaid';

    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }

      const content = await file.text();
      const name = file.name.replace(/\.(mmd|mermaid)$/, '');
      // @ts-expect-error - fallback doesn't have file handle
      resolve({ content, name, handle: null });
    };

    input.oncancel = () => resolve(null);
    input.click();
  });
}

/** Save content to an existing file handle */
export async function saveToHandle(handle: FileSystemFileHandle, content: string): Promise<boolean> {
  try {
    const writable = await handle.createWritable();
    await writable.write(content);
    await writable.close();
    return true;
  } catch (error) {
    console.error('Failed to save file:', error);
    return false;
  }
}

/** Save content to a new file (Save As) */
export async function saveAs(content: string, suggestedName: string): Promise<FileSystemFileHandle | null> {
  if (!isFileSystemSupported()) {
    saveAsFallback(content, suggestedName);
    return null;
  }

  try {
    const handle = await window.showSaveFilePicker({
      suggestedName: `${suggestedName}.mmd`,
      ...FILE_PICKER_OPTIONS
    });

    await saveToHandle(handle, content);
    return handle;
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      return null; // User cancelled
    }
    throw error;
  }
}

/** Fallback save for unsupported browsers */
function saveAsFallback(content: string, suggestedName: string): void {
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${suggestedName}.mmd`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Save diagram - uses existing handle or prompts for new location */
export async function saveDiagram(
  doc: DiagramDocument,
  existingHandle: FileSystemFileHandle | null
): Promise<{ success: boolean; handle: FileSystemFileHandle | null }> {
  if (existingHandle) {
    const success = await saveToHandle(existingHandle, doc.code);
    return { success, handle: existingHandle };
  }

  const handle = await saveAs(doc.code, doc.name);
  return { success: handle !== null, handle };
}

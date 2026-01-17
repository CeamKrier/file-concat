---
name: browser-api
description: Integrate browser APIs for file handling, clipboard operations, drag and drop, and Web Workers. Use when implementing file upload, copy/paste, drag-drop interactions, or offloading heavy computations.
---

# Browser API Integration

## When to Use This Skill

Use when implementing:
- File uploads or downloads
- Copy/paste functionality
- Drag and drop interfaces
- Background processing with Web Workers

## File API

### Reading Files

```typescript
async function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

async function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
```

### Downloading Files

```typescript
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadText(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/plain' });
  downloadBlob(blob, filename);
}
```

## Clipboard API

### Modern Async API (Preferred)

```typescript
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for older browsers or insecure context
    return copyToClipboardFallback(text);
  }
}

function copyToClipboardFallback(text: string): boolean {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();

  try {
    document.execCommand('copy');
    return true;
  } catch {
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
}

async function readFromClipboard(): Promise<string> {
  return navigator.clipboard.readText();
}
```

## Drag and Drop

### React Implementation

```tsx
interface DropZoneProps {
  onDrop: (files: File[]) => void;
  children: React.ReactNode;
}

function DropZone({ onDrop, children }: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    onDrop(files);
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={isDragging ? 'dragging' : ''}
    >
      {children}
    </div>
  );
}
```

### Directory Drop (webkitdirectory)

```typescript
async function processEntry(
  entry: FileSystemEntry,
  path = ""
): Promise<File[]> {
  const files: File[] = [];

  if (entry.isFile) {
    const fileEntry = entry as FileSystemFileEntry;
    const file = await new Promise<File>((resolve) => {
      fileEntry.file(resolve);
    });
    // Attach path for nested files
    Object.defineProperty(file, 'webkitRelativePath', {
      value: path + file.name
    });
    files.push(file);
  } else if (entry.isDirectory) {
    const dirEntry = entry as FileSystemDirectoryEntry;
    const reader = dirEntry.createReader();
    const entries = await new Promise<FileSystemEntry[]>((resolve) => {
      reader.readEntries(resolve);
    });

    for (const child of entries) {
      const childFiles = await processEntry(
        child,
        path + entry.name + "/"
      );
      files.push(...childFiles);
    }
  }

  return files;
}
```

## Web Workers

### Basic Worker Pattern

```typescript
// worker.ts
self.onmessage = (e: MessageEvent<{type: string; data: unknown}>) => {
  const { type, data } = e.data;

  switch (type) {
    case 'PROCESS':
      const result = heavyComputation(data);
      self.postMessage({ type: 'RESULT', data: result });
      break;
  }
};

// main.ts
const worker = new Worker(new URL('./worker.ts', import.meta.url));

worker.onmessage = (e) => {
  const { type, data } = e.data;
  if (type === 'RESULT') {
    handleResult(data);
  }
};

worker.postMessage({ type: 'PROCESS', data: input });
```

## Feature Detection

```typescript
const browserFeatures = {
  clipboard: 'clipboard' in navigator,
  fileSystem: 'showOpenFilePicker' in window,
  webWorker: 'Worker' in window,
  indexedDB: 'indexedDB' in window,
  storage: 'storage' in navigator,
};
```

## Best Practices

1. **Always provide fallbacks** - Not all browsers support all APIs
2. **Handle permissions** - Clipboard requires user gesture or permission
3. **Clean up resources** - Revoke object URLs, terminate workers
4. **Use feature detection** - Check API availability before use

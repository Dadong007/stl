import { lazy, Suspense, useRef, useState, type DragEvent } from 'react';
import type { IndexedMesh } from '../../engines/image';
import { downloadBytes, stlFilename } from './fileHelpers';
import {
  convertQuickFile,
  QuickConversionError,
  type QuickConversionKind,
  type QuickConversionMode,
} from './quickConversion';

const MeshPreview = lazy(() => import('./MeshPreview'));

type State = 'idle' | 'processing' | 'ready' | 'error';

export default function HomepageQuickConverter() {
  const input = useRef<HTMLInputElement>(null);
  const request = useRef(0);
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<State>('idle');
  const [message, setMessage] = useState('');
  const [mesh, setMesh] = useState<IndexedMesh | null>(null);
  const [stl, setStl] = useState<Uint8Array | null>(null);
  const [kind, setKind] = useState<QuickConversionKind | null>(null);
  const [mode, setMode] = useState<QuickConversionMode | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const openPicker = () => input.current?.click();

  const receiveFile = async (nextFile: File) => {
    const currentRequest = ++request.current;
    setFile(nextFile);
    setState('processing');
    setMessage('Creating your STL locally…');
    setMesh(null);
    setStl(null);
    setKind(null);
    setMode(null);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    try {
      const result = await convertQuickFile(nextFile);
      if (currentRequest !== request.current) return;
      setMesh(result.mesh);
      setStl(result.stl);
      setKind(result.kind);
      setMode(result.mode);
      setState('ready');
      setMessage('Your STL is ready to download.');
    } catch (error) {
      if (currentRequest !== request.current) return;
      setFile(null);
      setState('error');
      setMessage(error instanceof QuickConversionError
        ? error.message
        : 'This file could not be converted. Try another file.');
    }
  };

  const receiveDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setDragActive(false);
    const nextFile = event.dataTransfer.files[0];
    if (nextFile) void receiveFile(nextFile);
  };

  const hasSelectedFile = Boolean(file && (state === 'processing' || state === 'ready'));

  return (
    <section
      className={`home-quick-converter${dragActive ? ' is-dragging' : ''}`}
      aria-label="Quick image or 3MF to STL converter"
      data-state={state}
      data-kind={kind ?? undefined}
      data-mode={mode ?? undefined}
      onDragEnter={(event) => {
        event.preventDefault();
        setDragActive(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragActive(false);
      }}
      onDrop={receiveDrop}
    >
      <input
        ref={input}
        id="home-quick-upload"
        className="upload-input"
        type="file"
        tabIndex={-1}
        accept=".jpg,.jpeg,.png,.3mf,image/jpeg,image/png,model/3mf"
        aria-label="Choose a JPG, PNG, JPEG, or 3MF file"
        onChange={(event) => {
          const nextFile = event.currentTarget.files?.[0];
          if (nextFile) void receiveFile(nextFile);
          event.currentTarget.value = '';
        }}
      />

      {hasSelectedFile ? (
        <div className="home-quick-result">
          <div className="home-quick-file-row">
            <div>
              <span>Selected file</span>
              <strong>{file?.name}</strong>
            </div>
            <button className="home-quick-replace" type="button" onClick={openPicker}>
              Choose another file
            </button>
          </div>

          <div className="home-quick-preview">
            {mesh ? (
              <Suspense fallback={<div className="home-quick-preview-state">Loading 3D preview…</div>}>
                <MeshPreview mesh={mesh} />
              </Suspense>
            ) : (
              <div className="home-quick-preview-state">
                <span className="spinner" aria-hidden="true" />
                <span>Building your model…</span>
              </div>
            )}
          </div>

          <div className="home-quick-actions">
            <div className={`home-quick-status home-quick-status-${state}`} role="status" aria-live="polite">
              {message}
            </div>
            <button
              className="home-quick-download"
              type="button"
              disabled={!stl || state !== 'ready' || !file}
              onClick={() => stl && file && downloadBytes(stl, stlFilename(file.name))}
            >
              Download STL
            </button>
          </div>
        </div>
      ) : (
        <div className="home-quick-initial">
          <svg className="home-quick-icon" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
            <path d="M16 21V5m0 0-6 6m6-6 6 6M6 20v5.5A2.5 2.5 0 0 0 8.5 28h15a2.5 2.5 0 0 0 2.5-2.5V20"></path>
          </svg>
          <button className="home-quick-choose" type="button" onClick={openPicker}>Choose a file</button>
          <p>or drop a file here</p>
          <span>JPG · PNG · JPEG · 3MF</span>
          {state === 'error' && <div className="home-quick-error" role="alert">{message}</div>}
        </div>
      )}
    </section>
  );
}

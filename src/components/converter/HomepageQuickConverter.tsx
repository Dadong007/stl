import { lazy, Suspense, useEffect, useRef, useState, type DragEvent } from 'react';
import type { IndexedMesh } from '../../engines/image';
import { downloadBytes, stlFilename } from './fileHelpers';
import {
  IMAGE_DEFAULT_DEPTH_MM,
  IMAGE_DEFAULT_SIZE_MM,
} from './imageInput';
import {
  IMAGE_DEPTH_STEP_MM,
  IMAGE_MAX_DEPTH_MM,
  IMAGE_MAX_SIZE_MM,
  IMAGE_MIN_DEPTH_MM,
  IMAGE_MIN_SIZE_MM,
  IMAGE_SIZE_STEP_MM,
  validImageParameter,
} from './imageParameters';
import {
  convertQuickFile,
  quickFileKind,
  QuickConversionError,
  type QuickConversionKind,
  type QuickConversionMode,
  type QuickImageMode,
  type QuickImageSettings,
} from './quickConversion';

const MeshPreview = lazy(() => import('./MeshPreview'));

type State = 'idle' | 'processing' | 'ready' | 'error';

const defaultDepth = String(IMAGE_DEFAULT_DEPTH_MM);
const defaultSize = String(IMAGE_DEFAULT_SIZE_MM);

export default function HomepageQuickConverter() {
  const root = useRef<HTMLElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const request = useRef(0);
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<State>('idle');
  const [message, setMessage] = useState('');
  const [mesh, setMesh] = useState<IndexedMesh | null>(null);
  const [stl, setStl] = useState<Uint8Array | null>(null);
  const [kind, setKind] = useState<QuickConversionKind | null>(null);
  const [mode, setMode] = useState<QuickConversionMode | null>(null);
  const [style, setStyle] = useState<QuickImageMode>('relief');
  const [depth, setDepth] = useState(defaultDepth);
  const [size, setSize] = useState(defaultSize);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const depthValue = validImageParameter(
    depth,
    IMAGE_MIN_DEPTH_MM,
    IMAGE_MAX_DEPTH_MM,
    IMAGE_DEPTH_STEP_MM,
  );
  const sizeValue = validImageParameter(
    size,
    IMAGE_MIN_SIZE_MM,
    IMAGE_MAX_SIZE_MM,
    IMAGE_SIZE_STEP_MM,
  );
  const showWorkspace = state !== 'idle' && file !== null;
  const isImage = kind === 'jpg' || kind === 'png';

  useEffect(() => {
    const hero = root.current?.closest('.home-hero');
    if (!(hero instanceof HTMLElement)) return;
    hero.classList.toggle('is-quick-active', state !== 'idle');
    return () => hero.classList.remove('is-quick-active');
  }, [state]);

  const openPicker = () => input.current?.click();

  const runConversion = async (nextFile: File, settings?: QuickImageSettings) => {
    const currentRequest = ++request.current;
    const detectedKind = quickFileKind(nextFile);
    setFile(nextFile);
    setState('processing');
    setMessage(detectedKind === '3mf' ? 'Converting your model…' : 'Generating preview…');
    setMesh(null);
    setStl(null);
    setKind(detectedKind);
    setMode(settings?.mode ?? (detectedKind === '3mf' ? '3mf' : null));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    try {
      const result = await convertQuickFile(nextFile, settings);
      if (currentRequest !== request.current) return;
      setMesh(result.mesh);
      setStl(result.stl);
      setKind(result.kind);
      setMode(result.mode);
      if (result.mode === 'relief' || result.mode === 'extrude') setStyle(result.mode);
      setState('ready');
      setMessage('Your STL is ready.');
    } catch (error) {
      if (currentRequest !== request.current) return;
      setState('error');
      setMessage(error instanceof QuickConversionError
        ? error.message
        : 'This file could not be converted. Choose another file and try again.');
    }
  };

  const receiveFile = (nextFile: File) => {
    setStyle('relief');
    setDepth(defaultDepth);
    setSize(defaultSize);
    setSettingsOpen(false);
    void runConversion(nextFile);
  };

  const regenerate = (nextStyle: QuickImageMode, nextDepth: string, nextSize: string) => {
    if (!file || !isImage) return;
    const nextDepthValue = validImageParameter(
      nextDepth,
      IMAGE_MIN_DEPTH_MM,
      IMAGE_MAX_DEPTH_MM,
      IMAGE_DEPTH_STEP_MM,
    );
    const nextSizeValue = validImageParameter(
      nextSize,
      IMAGE_MIN_SIZE_MM,
      IMAGE_MAX_SIZE_MM,
      IMAGE_SIZE_STEP_MM,
    );
    if (nextDepthValue === null || nextSizeValue === null) {
      request.current += 1;
      setMode(nextStyle);
      setState('error');
      setMessage(nextDepthValue === null
        ? 'Enter a depth from 0.5 to 50 mm in 0.5 mm steps.'
        : 'Enter a whole-number size from 10 to 300 mm.');
      setMesh(null);
      setStl(null);
      return;
    }
    void runConversion(file, {
      mode: nextStyle,
      depthMm: nextDepthValue,
      sizeMm: nextSizeValue,
    });
  };

  const receiveDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setDragActive(false);
    const nextFile = event.dataTransfer.files[0];
    if (nextFile) receiveFile(nextFile);
  };

  const summary = kind === '3mf'
    ? '3MF → STL'
    : mode && isImage
      ? `${mode === 'extrude' ? 'Extrude' : 'Relief'} · ${depthValue ?? '—'} mm · ${sizeValue ?? '—'} mm`
      : 'Preparing conversion…';

  return (
    <section
      ref={root}
      className={`home-quick-converter${dragActive ? ' is-dragging' : ''}`}
      aria-label="Quick image or 3MF to STL converter"
      aria-busy={state === 'processing'}
      data-state={state}
      data-kind={kind ?? undefined}
      data-mode={mode ?? undefined}
      data-settings-open={settingsOpen ? 'true' : 'false'}
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
        accept=".jpg,.jpeg,.png,.3mf"
        aria-label="Choose a JPG, PNG, JPEG, or 3MF file"
        onChange={(event) => {
          const nextFile = event.currentTarget.files?.[0];
          if (nextFile) receiveFile(nextFile);
          event.currentTarget.value = '';
        }}
      />

      {showWorkspace ? (
        <div className="home-quick-result">
          <div className="home-quick-file-row">
            <div>
              <span>Selected file</span>
              <strong title={file.name}>{file.name}</strong>
            </div>
            <button className="home-quick-replace" type="button" onClick={openPicker}>
              Choose another file
            </button>
          </div>

          <div className="home-quick-preview">
            {mesh ? (
              <Suspense fallback={<div className="home-quick-preview-state">Loading 3D preview…</div>}>
                <MeshPreview mesh={mesh} fitPadding={0.06} />
              </Suspense>
            ) : (
              <div className="home-quick-preview-state">
                {state === 'processing' && <span className="spinner" aria-hidden="true" />}
                <span>{state === 'error' ? 'Preview unavailable.' : message}</span>
              </div>
            )}
          </div>

          <div className="home-quick-summary-row">
            <strong>{summary}</strong>
            {isImage && mode && !settingsOpen && (
              <button
                className="home-quick-adjust"
                type="button"
                aria-expanded={settingsOpen}
                aria-controls="home-quick-settings"
                onClick={() => setSettingsOpen(true)}
              >
                Adjust
              </button>
            )}
          </div>

          {settingsOpen && isImage && (
            <div id="home-quick-settings" className="home-quick-settings" aria-label="Image conversion settings">
              <div className="home-quick-settings-heading">
                <strong>Adjust settings</strong>
                <button type="button" onClick={() => setSettingsOpen(false)}>Done</button>
              </div>
              <div className="home-quick-settings-grid">
                <fieldset className="home-quick-style-control">
                  <legend>Style</legend>
                  <div>
                    {(['relief', 'extrude'] as const).map((option) => (
                      <label className="home-quick-style-option" key={option}>
                        <input
                          type="radio"
                          name="home-quick-style"
                          value={option}
                          checked={style === option}
                          onChange={() => {
                            setStyle(option);
                            regenerate(option, depth, size);
                          }}
                        />
                        <span>{option === 'relief' ? 'Relief' : 'Extrude'}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <label>
                  <span>Depth</span>
                  <span className="home-quick-number-control">
                    <input
                      type="number"
                      min={IMAGE_MIN_DEPTH_MM}
                      max={IMAGE_MAX_DEPTH_MM}
                      step={IMAGE_DEPTH_STEP_MM}
                      value={depth}
                      aria-invalid={depthValue === null}
                      onChange={(event) => {
                        const nextDepth = event.target.value;
                        setDepth(nextDepth);
                        regenerate(style, nextDepth, size);
                      }}
                    />
                    <span>mm</span>
                  </span>
                </label>
                <label>
                  <span>Size</span>
                  <span className="home-quick-number-control">
                    <input
                      type="number"
                      min={IMAGE_MIN_SIZE_MM}
                      max={IMAGE_MAX_SIZE_MM}
                      step={IMAGE_SIZE_STEP_MM}
                      value={size}
                      aria-invalid={sizeValue === null}
                      onChange={(event) => {
                        const nextSize = event.target.value;
                        setSize(nextSize);
                        regenerate(style, depth, nextSize);
                      }}
                    />
                    <span>mm</span>
                  </span>
                </label>
              </div>
            </div>
          )}

          <div className="home-quick-actions">
            <div
              className={`home-quick-status home-quick-status-${state}`}
              role={state === 'error' ? 'alert' : 'status'}
              aria-live="polite"
            >
              {state === 'processing' && <span className="spinner" aria-hidden="true" />}
              <span>{message}</span>
            </div>
            <button
              className="home-quick-download"
              type="button"
              disabled={!stl || state !== 'ready'}
              onClick={() => stl && downloadBytes(stl, stlFilename(file.name))}
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
        </div>
      )}
    </section>
  );
}

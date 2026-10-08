import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { IndexedMesh } from '../../engines/image';
import { downloadBytes, friendlyConversionError, stlFilename } from './fileHelpers';
import {
  hasTransparency,
  IMAGE_INTERNAL_RESOLUTION,
  IMAGE_MAX_BYTES,
  IMAGE_MAX_DIMENSION,
  inspectImage,
  isSupportedImage,
  type AcceptedImageInput,
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
import UploadField from './UploadField';

const MeshPreview = lazy(() => import('./MeshPreview'));

type Style = 'relief' | 'extrude';
type State = 'idle' | 'processing' | 'ready' | 'error';

interface ImageConverterProps {
  acceptedInput?: AcceptedImageInput;
  defaultStyle?: Style;
  autoStyleFromTransparency?: boolean;
  uploadPrompt?: string;
  unifiedWorkspace?: boolean;
}

export default function ImageConverter({
  acceptedInput = 'image',
  defaultStyle = 'relief',
  autoStyleFromTransparency = true,
  uploadPrompt,
  unifiedWorkspace = false,
}: ImageConverterProps) {
  const [file, setFile] = useState<File | null>(null);
  const [style, setStyle] = useState<Style>(defaultStyle);
  const [depth, setDepth] = useState('3');
  const [size, setSize] = useState('100');
  const [state, setState] = useState<State>('idle');
  const inputLabel = acceptedInput === 'png' ? 'PNG' : acceptedInput === 'jpg' ? 'JPG or JPEG' : 'JPG or PNG';
  const accept = acceptedInput === 'png'
    ? '.png,image/png'
    : acceptedInput === 'jpg'
      ? '.jpg,.jpeg,image/jpeg'
      : '.jpg,.jpeg,.png,image/jpeg,image/png';
  const [message, setMessage] = useState(`Choose a ${inputLabel} to begin.`);
  const [mesh, setMesh] = useState<IndexedMesh | null>(null);
  const [stl, setStl] = useState<Uint8Array | null>(null);
  const request = useRef(0);
  const styleChangeVersion = useRef(0);
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

  const receiveFile = async (nextFile: File) => {
    const currentRequest = ++request.current;
    const initialStyleVersion = styleChangeVersion.current;
    setMesh(null);
    setStl(null);
    if (!isSupportedImage(nextFile, acceptedInput)) {
      setFile(null);
      setState('error');
      setMessage(`Choose a ${inputLabel} image.`);
      return;
    }
    if (nextFile.size > IMAGE_MAX_BYTES) {
      setFile(null);
      setState('error');
      setMessage('This image is larger than 20 MB. Choose a smaller file.');
      return;
    }
    try {
      const inspection = await inspectImage(nextFile);
      if (currentRequest !== request.current) return;
      if (inspection.width > IMAGE_MAX_DIMENSION || inspection.height > IMAGE_MAX_DIMENSION) {
        setFile(null);
        setState('error');
        setMessage('This image is larger than 4096 × 4096 pixels. Resize it and try again.');
        return;
      }
      if (styleChangeVersion.current === initialStyleVersion) {
        setStyle(autoStyleFromTransparency && inspection.meaningfulTransparency ? 'extrude' : defaultStyle);
      }
    } catch {
      if (currentRequest !== request.current) return;
      setFile(null);
      setState('error');
      setMessage(`We could not read this image. Try another ${inputLabel} file.`);
      return;
    }
    setFile(nextFile);
  };

  useEffect(() => {
    if (!file) return;
    const currentRequest = ++request.current;
    if (depthValue === null || sizeValue === null) {
      setState('error');
      setMessage(depthValue === null
        ? 'Enter a depth from 0.5 to 50 mm in 0.5 mm steps.'
        : 'Enter a whole-number size from 10 to 300 mm.');
      setMesh(null);
      setStl(null);
      return;
    }
    let cancelled = false;

    const generate = async () => {
      setState('processing');
      setMessage('Creating your printable model…');
      setMesh(null);
      setStl(null);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      try {
        const imageEngine = await import('../../engines/image');
        const pixels = await imageEngine.decodeImage(file, IMAGE_INTERNAL_RESOLUTION);
        if (cancelled || currentRequest !== request.current) return;
        const nextMesh = style === 'relief'
          ? imageEngine.createReliefMesh(pixels, {
              widthMm: sizeValue,
              reliefDepthMm: depthValue,
              baseThicknessMm: 1.5,
            })
          : imageEngine.createExtrudedMesh(pixels, {
              widthMm: sizeValue,
              depthMm: depthValue,
              maskMode: hasTransparency(pixels.data) ? 'alpha' : 'dark-on-light',
            });
        const { exportBinaryStl } = await import('../../engines/formats/stl');
        const nextStl = exportBinaryStl(nextMesh);
        if (cancelled || currentRequest !== request.current) return;
        setMesh(nextMesh);
        setStl(nextStl);
        setState('ready');
        setMessage(`${file.name} is ready to download.`);
      } catch (error) {
        if (cancelled || currentRequest !== request.current) return;
        setState('error');
        setMessage(friendlyConversionError(error, 'image'));
      }
    };

    void generate();
    return () => {
      cancelled = true;
    };
  }, [file, style, depthValue, sizeValue]);

  const selectStyle = (nextStyle: Style) => {
    styleChangeVersion.current += 1;
    setStyle(nextStyle);
  };

  const statusPanel = (
    <div className={`converter-status status-${state}`} role={state === 'error' ? 'alert' : 'status'} aria-live="polite">
      {state === 'processing' && <span className="spinner" aria-hidden="true" />}
      <span>{message}</span>
    </div>
  );

  const downloadButton = (
    <button
      className="primary-button"
      type="button"
      disabled={!stl || state !== 'ready' || !file}
      onClick={() => stl && file && downloadBytes(stl, stlFilename(file.name))}
    >
      Download STL
    </button>
  );

  return (
    <section
      className={`converter${unifiedWorkspace ? ' image-workspace' : ''}`}
      aria-label="Image to STL converter"
    >
      <div className="converter-controls">
        <UploadField
          id="image-upload"
          accept={accept}
          prompt={file ? file.name : (uploadPrompt ?? `Upload a ${inputLabel} image`)}
          detail="Choose a file or drop it here · up to 20 MB"
          onFile={(nextFile) => void receiveFile(nextFile)}
        />

        <div className="control-grid" aria-label="Model settings">
          {unifiedWorkspace ? (
            <fieldset className="image-style-control">
              <legend>Style</legend>
              <div>
                {(['relief', 'extrude'] as const).map((option) => (
                  <label className="image-style-option" key={option}>
                    <input
                      type="radio"
                      name="image-converter-style"
                      value={option}
                      checked={style === option}
                      onChange={() => selectStyle(option)}
                    />
                    <span>{option === 'relief' ? 'Relief' : 'Extrude'}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : (
            <label>
              <span>Style</span>
              <select
                value={style}
                onChange={(event) => selectStyle(event.target.value as Style)}
              >
                <option value="relief">Relief</option>
                <option value="extrude">Extrude</option>
              </select>
            </label>
          )}
          <label>
            <span>Depth</span>
            <span className="number-control">
              <input
                type="number"
                min="0.5"
                max="50"
                step="0.5"
                value={depth}
                aria-invalid={depthValue === null}
                onChange={(event) => setDepth(event.target.value)}
              />
              <span>mm</span>
            </span>
          </label>
          <label>
            <span>Size</span>
            <span className="number-control">
              <input
                type="number"
                min="10"
                max="300"
                step="1"
                value={size}
                aria-invalid={sizeValue === null}
                onChange={(event) => setSize(event.target.value)}
              />
              <span>mm</span>
            </span>
          </label>
        </div>

        {!unifiedWorkspace && statusPanel}
        {!unifiedWorkspace && downloadButton}
      </div>

      <div className="preview-panel">
        {mesh ? (
          <Suspense fallback={<div className="preview-placeholder">Loading 3D preview…</div>}>
            <MeshPreview
              mesh={mesh}
              backgroundColor={unifiedWorkspace ? 0xf4f7f6 : undefined}
              pixelRatioCap={unifiedWorkspace ? 3 : undefined}
            />
          </Suspense>
        ) : (
          <div className="preview-placeholder">
            <span aria-hidden="true">3D</span>
            <p>{state === 'processing' ? 'Building your model…' : 'Your 3D preview will appear here.'}</p>
          </div>
        )}
      </div>

      {unifiedWorkspace && (
        <div className="image-workspace-completion">
          {statusPanel}
          {downloadButton}
        </div>
      )}
    </section>
  );
}

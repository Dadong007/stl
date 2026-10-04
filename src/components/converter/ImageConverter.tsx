import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { IndexedMesh } from '../../engines/image';
import { downloadBytes, friendlyConversionError, stlFilename } from './fileHelpers';
import UploadField from './UploadField';

const MeshPreview = lazy(() => import('./MeshPreview'));
const MAX_BYTES = 20 * 1024 * 1024;
const MAX_DIMENSION = 4096;
const INTERNAL_RESOLUTION = 512;

type Style = 'relief' | 'extrude';
type State = 'idle' | 'processing' | 'ready' | 'error';
type AcceptedInput = 'image' | 'png' | 'jpg';

interface ImageConverterProps {
  acceptedInput?: AcceptedInput;
  defaultStyle?: Style;
  autoStyleFromTransparency?: boolean;
  uploadPrompt?: string;
}

function isSupportedImage(file: File, acceptedInput: AcceptedInput): boolean {
  const extension = file.name.toLowerCase().match(/\.[^.]+$/)?.[0];
  if (acceptedInput === 'png') return extension === '.png';
  if (acceptedInput === 'jpg') return extension === '.jpg' || extension === '.jpeg';
  return extension === '.jpg' || extension === '.jpeg' || extension === '.png';
}

async function inspectImage(file: File): Promise<{
  width: number;
  height: number;
  meaningfulTransparency: boolean;
}> {
  const bitmap = await createImageBitmap(file);
  try {
    let meaningfulTransparency = false;
    if (file.name.toLowerCase().endsWith('.png') && bitmap.width <= MAX_DIMENSION && bitmap.height <= MAX_DIMENSION) {
      const scale = Math.min(1, 256 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('Canvas 2D is unavailable.');
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const minimumTransparentPixels = Math.max(8, Math.ceil((data.length / 4) * 0.005));
      let transparentPixels = 0;
      for (let index = 3; index < data.length; index += 4) {
        if (data[index] < 250 && ++transparentPixels >= minimumTransparentPixels) {
          meaningfulTransparency = true;
          break;
        }
      }
    }
    return { width: bitmap.width, height: bitmap.height, meaningfulTransparency };
  } finally {
    bitmap.close();
  }
}

function hasTransparency(data: ArrayLike<number>): boolean {
  for (let index = 3; index < data.length; index += 4) {
    if (data[index] < 255) return true;
  }
  return false;
}

export default function ImageConverter({
  acceptedInput = 'image',
  defaultStyle = 'relief',
  autoStyleFromTransparency = true,
  uploadPrompt,
}: ImageConverterProps) {
  const [file, setFile] = useState<File | null>(null);
  const [style, setStyle] = useState<Style>(defaultStyle);
  const [depth, setDepth] = useState(3);
  const [size, setSize] = useState(100);
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
    if (nextFile.size > MAX_BYTES) {
      setFile(null);
      setState('error');
      setMessage('This image is larger than 20 MB. Choose a smaller file.');
      return;
    }
    try {
      const inspection = await inspectImage(nextFile);
      if (currentRequest !== request.current) return;
      if (inspection.width > MAX_DIMENSION || inspection.height > MAX_DIMENSION) {
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
    let cancelled = false;

    const generate = async () => {
      setState('processing');
      setMessage('Creating your printable model…');
      setMesh(null);
      setStl(null);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      try {
        const imageEngine = await import('../../engines/image');
        const pixels = await imageEngine.decodeImage(file, INTERNAL_RESOLUTION);
        if (cancelled || currentRequest !== request.current) return;
        const widthMm = Math.min(300, Math.max(10, size));
        const depthMm = Math.min(50, Math.max(0.5, depth));
        const nextMesh = style === 'relief'
          ? imageEngine.createReliefMesh(pixels, {
              widthMm,
              reliefDepthMm: depthMm,
              baseThicknessMm: 1.5,
            })
          : imageEngine.createExtrudedMesh(pixels, {
              widthMm,
              depthMm,
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
  }, [file, style, depth, size]);

  return (
    <section className="converter" aria-label="Image to STL converter">
      <div className="converter-controls">
        <UploadField
          id="image-upload"
          accept={accept}
          prompt={file ? file.name : (uploadPrompt ?? `Upload a ${inputLabel} image`)}
          detail="Choose a file or drop it here · up to 20 MB"
          onFile={(nextFile) => void receiveFile(nextFile)}
        />

        <div className="control-grid" aria-label="Model settings">
          <label>
            <span>Style</span>
            <select
              value={style}
              onChange={(event) => {
                styleChangeVersion.current += 1;
                setStyle(event.target.value as Style);
              }}
            >
              <option value="relief">Relief</option>
              <option value="extrude">Extrude</option>
            </select>
          </label>
          <label>
            <span>Depth</span>
            <span className="number-control">
              <input
                type="number"
                min="0.5"
                max="50"
                step="0.5"
                value={depth}
                onChange={(event) => setDepth(Number(event.target.value))}
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
                onChange={(event) => setSize(Number(event.target.value))}
              />
              <span>mm</span>
            </span>
          </label>
        </div>

        <div className={`converter-status status-${state}`} role={state === 'error' ? 'alert' : 'status'} aria-live="polite">
          {state === 'processing' && <span className="spinner" aria-hidden="true" />}
          <span>{message}</span>
        </div>

        <button
          className="primary-button"
          type="button"
          disabled={!stl || state !== 'ready' || !file}
          onClick={() => stl && file && downloadBytes(stl, stlFilename(file.name))}
        >
          Download STL
        </button>
      </div>

      <div className="preview-panel">
        {mesh ? (
          <Suspense fallback={<div className="preview-placeholder">Loading 3D preview…</div>}>
            <MeshPreview mesh={mesh} />
          </Suspense>
        ) : (
          <div className="preview-placeholder">
            <span aria-hidden="true">3D</span>
            <p>{state === 'processing' ? 'Building your model…' : 'Your 3D preview will appear here.'}</p>
          </div>
        )}
      </div>
    </section>
  );
}

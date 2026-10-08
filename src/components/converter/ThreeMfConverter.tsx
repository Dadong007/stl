import { lazy, Suspense, useRef, useState } from 'react';
import type { IndexedMesh } from '../../engines/formats/stl';
import { downloadBytes, friendlyConversionError, stlFilename } from './fileHelpers';
import UploadField from './UploadField';

const MeshPreview = lazy(() => import('./MeshPreview'));
const MAX_BYTES = 50 * 1024 * 1024;

type State = 'idle' | 'processing' | 'ready' | 'error';

export default function ThreeMfConverter() {
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<State>('idle');
  const [message, setMessage] = useState('Choose a 3MF file to begin.');
  const [mesh, setMesh] = useState<IndexedMesh | null>(null);
  const [stl, setStl] = useState<Uint8Array | null>(null);
  const request = useRef(0);

  const receiveFile = async (nextFile: File) => {
    const currentRequest = ++request.current;
    setFile(null);
    setMesh(null);
    setStl(null);
    if (!nextFile.name.toLowerCase().endsWith('.3mf')) {
      setState('error');
      setMessage('Choose a file with the .3mf extension.');
      return;
    }
    if (nextFile.size > MAX_BYTES) {
      setState('error');
      setMessage('This 3MF file is larger than 50 MB. Choose a smaller file.');
      return;
    }

    setFile(nextFile);
    setState('processing');
    setMessage('Converting the model locally in your browser…');
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    try {
      const [threeMfEngine, stlEngine] = await Promise.all([
        import('../../engines/formats/threeMf'),
        import('../../engines/formats/stl'),
      ]);
      const input = new Uint8Array(await nextFile.arrayBuffer());
      const converted = await threeMfEngine.convertWithLib3mf(input, '3mf', 'stl');
      const nextMesh = stlEngine.parseStl(converted.bytes, nextFile.name);
      if (currentRequest !== request.current) return;
      setStl(converted.bytes);
      setMesh(nextMesh);
      setState('ready');
      setMessage(`${nextFile.name} is ready to download.`);
    } catch (error) {
      if (currentRequest !== request.current) return;
      setState('error');
      setMessage(friendlyConversionError(error, '3mf'));
    }
  };

  return (
    <section className="converter converter-format" aria-label="3MF to STL converter">
      <div className="converter-controls">
        <UploadField
          id="three-mf-upload"
          accept=".3mf"
          prompt={file ? file.name : 'Upload a 3MF model'}
          detail="Choose a file or drop it here · up to 50 MB"
          onFile={(nextFile) => void receiveFile(nextFile)}
        />

        <div className={`converter-status status-${state}`} role={state === 'error' ? 'alert' : 'status'} aria-live="polite">
          {state === 'processing' && <span className="spinner" aria-hidden="true" />}
          <span>{message}</span>
        </div>

        <p className="format-note">
          STL stores geometry only. Colors, materials, textures and other 3MF metadata are not preserved.
        </p>

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
            <p>{state === 'processing' ? 'Reading your model…' : 'Your 3D preview will appear here.'}</p>
          </div>
        )}
      </div>
    </section>
  );
}

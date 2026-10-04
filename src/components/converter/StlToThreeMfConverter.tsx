import { lazy, Suspense, useRef, useState } from 'react';
import type { IndexedMesh } from '../../engines/formats/stl';
import { downloadBytes, friendlyConversionError, threeMfFilename } from './fileHelpers';
import UploadField from './UploadField';

const MeshPreview = lazy(() => import('./MeshPreview'));
const MAX_BYTES = 50 * 1024 * 1024;

type State = 'idle' | 'processing' | 'ready' | 'error';

export default function StlToThreeMfConverter() {
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<State>('idle');
  const [message, setMessage] = useState('Choose an STL file to begin.');
  const [mesh, setMesh] = useState<IndexedMesh | null>(null);
  const [threeMf, setThreeMf] = useState<Uint8Array | null>(null);
  const request = useRef(0);

  const receiveFile = async (nextFile: File) => {
    const currentRequest = ++request.current;
    setFile(null);
    setMesh(null);
    setThreeMf(null);
    if (!nextFile.name.toLowerCase().endsWith('.stl')) {
      setState('error');
      setMessage('Choose a file with the .stl extension.');
      return;
    }
    if (nextFile.size > MAX_BYTES) {
      setState('error');
      setMessage('This STL file is larger than 50 MB. Choose a smaller file.');
      return;
    }

    setFile(nextFile);
    setState('processing');
    setMessage('Converting the model locally in your browser…');
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    try {
      const [stlEngine, threeMfEngine] = await Promise.all([
        import('../../engines/formats/stl'),
        import('../../engines/formats/threeMf'),
      ]);
      const input = new Uint8Array(await nextFile.arrayBuffer());
      const nextMesh = stlEngine.parseStl(input, nextFile.name);
      const converted = await threeMfEngine.convertWithLib3mf(input, 'stl', '3mf');
      if (currentRequest !== request.current) return;
      setMesh(nextMesh);
      setThreeMf(converted.bytes);
      setState('ready');
      setMessage(`${nextFile.name} is ready to download.`);
    } catch (error) {
      if (currentRequest !== request.current) return;
      setState('error');
      setMessage(friendlyConversionError(error, 'stl'));
    }
  };

  return (
    <section className="converter converter-format" aria-label="STL to 3MF converter">
      <div className="converter-controls">
        <UploadField
          id="stl-upload"
          accept=".stl,model/stl"
          prompt={file ? file.name : 'Upload an STL model'}
          detail="Choose a file or drop it here · up to 50 MB"
          onFile={(nextFile) => void receiveFile(nextFile)}
        />

        <div className={`converter-status status-${state}`} role={state === 'error' ? 'alert' : 'status'} aria-live="polite">
          {state === 'processing' && <span className="spinner" aria-hidden="true" />}
          <span>{message}</span>
        </div>

        <p className="format-note">
          STL files do not include unit metadata. IntoSTL treats STL units as millimeters.
        </p>

        <button
          className="primary-button"
          type="button"
          disabled={!threeMf || state !== 'ready' || !file}
          onClick={() => threeMf && file && downloadBytes(threeMf, threeMfFilename(file.name), 'model/3mf')}
        >
          Download 3MF
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

import { useRef, type DragEvent, type KeyboardEvent } from 'react';

interface UploadFieldProps {
  id: string;
  accept: string;
  prompt: string;
  detail: string;
  onFile: (file: File) => void;
}

export default function UploadField({ id, accept, prompt, detail, onFile }: UploadFieldProps) {
  const input = useRef<HTMLInputElement>(null);

  const openPicker = (event: KeyboardEvent<HTMLLabelElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      input.current?.click();
    }
  };

  const receiveDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file) onFile(file);
  };

  return (
    <label
      className="upload-field"
      htmlFor={id}
      role="button"
      tabIndex={0}
      onKeyDown={openPicker}
      onDragOver={(event) => event.preventDefault()}
      onDrop={receiveDrop}
    >
      <span className="upload-icon" aria-hidden="true">+</span>
      <strong>{prompt}</strong>
      <span>{detail}</span>
      <input
        ref={input}
        id={id}
        className="upload-input"
        type="file"
        accept={accept}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) onFile(file);
          event.currentTarget.value = '';
        }}
      />
    </label>
  );
}

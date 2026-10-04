export function stlFilename(sourceName: string): string {
  const stem = sourceName.replace(/\.[^.]+$/, '') || 'model';
  return `${stem}.stl`;
}

export function threeMfFilename(sourceName: string): string {
  const stem = sourceName.replace(/\.[^.]+$/, '') || 'model';
  return `${stem}.3mf`;
}

export function downloadBytes(bytes: Uint8Array, filename: string, type = 'model/stl'): void {
  const buffer = bytes.slice().buffer as ArrayBuffer;
  const url = URL.createObjectURL(new Blob([buffer], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function friendlyConversionError(error: unknown, subject: 'image' | '3mf' | 'stl'): string {
  if (error instanceof RangeError || (error instanceof Error && /memory|allocation/i.test(error.message))) {
    return 'This file needs more memory than the browser can safely provide. Try a smaller file or close other tabs.';
  }
  if (subject === 'image' && error instanceof Error && /No foreground|did not produce geometry/i.test(error.message)) {
    return 'No usable foreground was found. Try a graphic with a clearer contrast or transparent background.';
  }
  if (subject === 'image') return 'The image could not be converted. Try another JPG or PNG file.';
  if (subject === 'stl') return 'The STL file could not be converted. Check that it is a valid binary or ASCII STL model and try again.';
  return 'The 3MF file could not be converted. Check that it is a valid 3MF model and try again.';
}

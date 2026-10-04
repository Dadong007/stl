export const SITE = {
  name: 'IntoSTL',
  origin: 'https://intostl.com',
  description: 'Simple tools for turning images and 3D files into printable models.',
} as const;

export function absoluteUrl(pathname: string): string {
  return new URL(pathname, SITE.origin).href;
}

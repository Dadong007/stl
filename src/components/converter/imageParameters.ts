export const IMAGE_MIN_DEPTH_MM = 0.5;
export const IMAGE_MAX_DEPTH_MM = 50;
export const IMAGE_DEPTH_STEP_MM = 0.5;
export const IMAGE_MIN_SIZE_MM = 10;
export const IMAGE_MAX_SIZE_MM = 300;
export const IMAGE_SIZE_STEP_MM = 1;

export function validImageParameter(
  value: string,
  minimum: number,
  maximum: number,
  step: number,
): number | null {
  if (value.trim() === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) return null;
  const stepsFromMinimum = (parsed - minimum) / step;
  return Math.abs(stepsFromMinimum - Math.round(stepsFromMinimum)) < Number.EPSILON * 100
    ? parsed
    : null;
}

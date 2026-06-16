export const ATTENUATION_LINEAR = "linear";
export const ATTENUATION_QUADRATIC = "quadratic";
export const ATTENUATION_INVERSE = "inverse";

export function computeAttenuation(distance, minDistance, maxDistance, model, inverseRolloff) {
  if (maxDistance <= 0) return 1;
  if (distance <= minDistance) return 1;
  if (distance >= maxDistance) return 0;
  const normalized = distance / maxDistance;
  let factor;
  switch (model) {
    case ATTENUATION_LINEAR:
      factor = 1 - normalized;
      break;
    case ATTENUATION_QUADRATIC:
      factor = 1 - normalized * normalized;
      break;
    case ATTENUATION_INVERSE:
      factor = 1 / (1 + inverseRolloff * normalized);
      break;
    default:
      factor = 1 - normalized;
      break;
  }
  return factor < 0 ? 0 : factor > 1 ? 1 : factor;
}

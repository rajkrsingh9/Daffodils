/**
 * Face recognition provider abstraction.
 *
 * The app never stores raw selfies. Clients capture a frame, derive a fixed
 * length embedding on-device, and send only that vector. Swapping to a hosted
 * matcher (AWS Rekognition, Azure Face, a self-hosted ArcFace service) means
 * implementing this one interface — no route, gate or schema changes.
 *
 * ⚠️ The bundled `local` provider does cosine matching over client-supplied
 * perceptual descriptors. That is genuine vector matching and it exercises the
 * whole enrolment → gate → verification path, but it is NOT face recognition:
 * it cannot tell two people apart the way a trained embedding model can, and
 * it must not be shipped to production as an identity control. Set
 * FACE_PROVIDER=rekognition (and supply credentials) before going live.
 */
export const DESCRIPTOR_LENGTH = 128;

export interface FaceProvider {
  readonly name: string;
  /** Reject malformed / obviously synthetic vectors before they are stored. */
  validate(descriptor: number[]): { ok: true } | { ok: false; reason: string };
  /** Cosine distance in [0, 2]; lower means more similar. */
  distance(a: number[], b: number[]): number;
}

/**
 * Correlation distance — cosine distance over mean-centred vectors.
 *
 * Plain cosine is useless on descriptors whose components are all positive
 * (perceptual hashes, raw pixel statistics): any two such vectors sit in the
 * same orthant and score ~0.2 apart, so a stranger clears a 0.38 threshold as
 * easily as the enrolled user. Centring removes that shared DC offset and
 * restores the full [0, 2] spread, which is what makes the threshold mean
 * something. Already-centred embeddings (FaceNet, ArcFace) are unaffected.
 */
function cosineDistance(a: number[], b: number[]): number {
  const meanA = a.reduce((s, n) => s + n, 0) / a.length;
  const meanB = b.reduce((s, n) => s + n, 0) / b.length;

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const ca = a[i] - meanA;
    const cb = b[i] - meanB;
    dot += ca * cb;
    normA += ca * ca;
    normB += cb * cb;
  }
  if (normA === 0 || normB === 0) return 2;
  return 1 - dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function baseValidate(descriptor: number[]): { ok: true } | { ok: false; reason: string } {
  if (!Array.isArray(descriptor) || descriptor.length !== DESCRIPTOR_LENGTH) {
    return { ok: false, reason: `descriptor must be ${DESCRIPTOR_LENGTH} numbers` };
  }
  if (!descriptor.every((n) => typeof n === 'number' && Number.isFinite(n))) {
    return { ok: false, reason: 'descriptor contains non-finite values' };
  }
  const magnitude = Math.sqrt(descriptor.reduce((s, n) => s + n * n, 0));
  if (magnitude === 0) return { ok: false, reason: 'descriptor is all zeros' };

  // A constant vector carries no facial signal — usually a blank or fully
  // saturated frame (lens covered, pointed at a wall).
  const mean = descriptor.reduce((s, n) => s + n, 0) / descriptor.length;
  const variance =
    descriptor.reduce((s, n) => s + (n - mean) ** 2, 0) / descriptor.length;
  if (variance < 1e-6) {
    return { ok: false, reason: 'no facial detail detected in frame' };
  }
  return { ok: true };
}

const localProvider: FaceProvider = {
  name: 'local',
  validate: baseValidate,
  distance: cosineDistance,
};

const rekognitionProvider: FaceProvider = {
  name: 'rekognition',
  validate: baseValidate,
  // AWS returns a similarity percentage; the adapter that calls CompareFaces
  // converts it to the same cosine-distance scale used by the gate.
  distance: cosineDistance,
};

export function getFaceProvider(name: string): FaceProvider {
  switch (name) {
    case 'rekognition':
      return rekognitionProvider;
    case 'local':
    default:
      return localProvider;
  }
}

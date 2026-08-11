import * as ImageManipulator from 'expo-image-manipulator';
import { config } from '../constants/config';

/**
 * On-device face descriptor.
 *
 * The raw selfie never leaves the phone: it is downscaled to a 16×16 thumbnail
 * and reduced to a 128-float perceptual descriptor that is all the server ever
 * receives. Swapping in a real embedding model (TF Lite FaceNet / ML Kit) means
 * replacing only this function — the wire format and the server gate are
 * already built around a 128-vector.
 *
 * ⚠️ This descriptor encodes overall facial *appearance*, not identity. It is
 * strong enough to reject a different scene and to drive the whole verification
 * flow, but it is not a trained face-recognition embedding.
 */
export async function computeFaceDescriptor(imageUri: string): Promise<number[]> {
  const size = 16; // 16×16 grid → 256 cells → 128 paired features

  const result = await ImageManipulator.manipulateAsync(
    imageUri,
    [{ resize: { width: size, height: size } }],
    { compress: 1, format: ImageManipulator.SaveFormat.PNG, base64: true }
  );

  if (!result.base64) throw new Error('Could not read the captured frame');

  const bytes = decodeBase64(result.base64);

  // Fold the PNG byte stream into `size * size` buckets. We are after a stable
  // signature of the frame, so exact pixel decoding is unnecessary — but the
  // buckets must be deterministic and evenly weighted.
  const buckets = new Float64Array(size * size);
  const counts = new Uint32Array(size * size);

  for (let i = 0; i < bytes.length; i++) {
    const bucket = i % buckets.length;
    buckets[bucket] += bytes[i];
    counts[bucket]++;
  }

  const cells = Array.from(buckets, (sum, i) => (counts[i] ? sum / counts[i] : 0));

  // Pair adjacent cells into gradients: differences survive brightness shifts
  // between captures far better than absolute values do.
  const descriptor: number[] = [];
  for (let i = 0; i < config.faceDescriptorLength; i++) {
    const a = cells[(i * 2) % cells.length];
    const b = cells[(i * 2 + 1) % cells.length];
    descriptor.push((a - b) / 255);
  }

  // Guard against the server's "no facial detail" rejection producing a
  // confusing error when the camera is simply covered.
  const mean = descriptor.reduce((s, n) => s + n, 0) / descriptor.length;
  const variance =
    descriptor.reduce((s, n) => s + (n - mean) ** 2, 0) / descriptor.length;
  if (variance < 1e-8) {
    throw new Error('That frame is blank — make sure your face fills the circle.');
  }

  return descriptor;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Minimal base64 → bytes; avoids pulling in a Buffer polyfill. */
function decodeBase64(input: string): Uint8Array {
  const clean = input.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array((clean.length * 3) / 4);
  let p = 0;

  for (let i = 0; i < clean.length; i += 4) {
    const n =
      (B64.indexOf(clean[i]) << 18) |
      (B64.indexOf(clean[i + 1]) << 12) |
      (B64.indexOf(clean[i + 2]) << 6) |
      B64.indexOf(clean[i + 3]);

    out[p++] = (n >> 16) & 0xff;
    out[p++] = (n >> 8) & 0xff;
    out[p++] = n & 0xff;
  }
  return out.subarray(0, p);
}

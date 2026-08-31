/** Max edge after resize. Keeps Firestore documents well under the 1 MB cap. */
const MAX_EDGE = 480;
const MAX_CHARS = 180_000;

/**
 * Turns a camera/gallery file into a JPEG data URL small enough to store on
 * the package document. Callers show Hebrew errors; this only throws codes.
 */
export async function compressPackageImage(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('not-image');
  if (file.size > 12 * 1024 * 1024) throw new Error('too-large');

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    bitmap = await createImageBitmap(file);
  }
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas');
    ctx.drawImage(bitmap, 0, 0, width, height);

    let quality = 0.74;
    let out = canvas.toDataURL('image/jpeg', quality);
    while (out.length > MAX_CHARS && quality > 0.42) {
      quality -= 0.1;
      out = canvas.toDataURL('image/jpeg', quality);
    }
    if (out.length > MAX_CHARS * 1.25) throw new Error('too-heavy');
    return out;
  } finally {
    bitmap.close();
  }
}

export function imageErrorMessage(err: unknown): string {
  const code = err instanceof Error ? err.message : '';
  if (code === 'not-image') return 'זה לא קובץ תמונה. בחר JPG או PNG.';
  if (code === 'too-large') return 'הקובץ גדול מדי. בחר תמונה עד 12MB.';
  if (code === 'too-heavy') return 'לא הצלחנו לדחוס את התמונה. נסה תמונה אחרת.';
  return 'לא הצלחנו לקרוא את התמונה. נסה קובץ אחר.';
}

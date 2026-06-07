/** Downscale an image blob to a max dimension and return a PNG data URL, or null on failure.
 *  Uses FileReader (data URL) → Image → canvas, which works in browsers and degrades
 *  gracefully where canvas is unavailable (returns null). */
export function downscaleToDataUrl(blob: Blob, max = 512): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onerror = () => resolve(null);
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        try {
          const longest = Math.max(img.width || 1, img.height || 1);
          const scale = Math.min(1, max / longest);
          const w = Math.max(1, Math.round((img.width || max) * scale));
          const h = Math.max(1, Math.round((img.height || max) * scale));
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (!ctx) return resolve(null);
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL("image/png"));
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = reader.result as string;
    };
    reader.readAsDataURL(blob);
  });
}

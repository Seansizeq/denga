export interface CompressOptions {
  maxSize?: number;
  quality?: number;
  mimeType?: 'image/jpeg' | 'image/webp';
}

export interface CompressedImage {
  base64: string;
  dataUrl: string;
  width: number;
  height: number;
  bytes: number;
}

const DEFAULTS: Required<CompressOptions> = {
  maxSize: 1600,
  quality: 0.85,
  mimeType: 'image/jpeg',
};

const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'));
    reader.readAsDataURL(file);
  });

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image decode failed'));
    img.src = src;
  });

export const compressImage = async (
  file: File,
  options?: CompressOptions
): Promise<CompressedImage> => {
  const opts = { ...DEFAULTS, ...options };
  const dataUrl = await readFileAsDataUrl(file);
  const img = await loadImage(dataUrl);

  const longest = Math.max(img.naturalWidth, img.naturalHeight);
  const scale = longest > opts.maxSize ? opts.maxSize / longest : 1;
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, width, height);

  const outDataUrl = canvas.toDataURL(opts.mimeType, opts.quality);
  const base64 = outDataUrl.split(',')[1] ?? '';
  const bytes = Math.floor((base64.length * 3) / 4);

  return { base64, dataUrl: outDataUrl, width, height, bytes };
};

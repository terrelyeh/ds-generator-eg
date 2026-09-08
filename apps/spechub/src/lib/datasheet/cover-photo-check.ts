import sharp from "sharp";
import type { CoverPhotoPolicy } from "./cover-photo";
import { SCRIM_TINT } from "./cover-photo";

/**
 * Will this photograph carry white type where the layout puts it?
 *
 * Advisory, never blocking. The judgement of whether a cover reads is the
 * designer's; what a machine can add is the thing the eye is worst at —
 * noticing that 0.2% of the pixels behind a line of text are bright, in a
 * region whose AVERAGE is comfortably dark.
 *
 * That average is exactly how the first data-centre photo shipped looking
 * fine: mean luminance put white text at 18:1, because the bright pixels are
 * a few narrow vertical LED strips and a mean drowns them. Only the tail
 * matters, so only the tail is reported.
 */
export interface CoverPhotoVerdict {
  /** Fraction of the text column below the layout's contrast target, 0–1. */
  belowTarget: number;
  /** The single worst pixel's contrast against white. */
  worst: number;
  /** Set when the result is worth showing the uploader. */
  warning: string | null;
}

/** Fraction of the text area allowed under target before anyone is told. */
const TOLERANCE = 0.005; // 0.5%

const srgbToLinear = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};

const contrastWithWhite = (luminance: number) => 1.05 / (luminance + 0.05);

export async function checkCoverPhoto(
  buffer: Buffer,
  policy: CoverPhotoPolicy,
): Promise<CoverPhotoVerdict> {
  const image = sharp(buffer);
  const { width = 0, height = 0 } = await image.metadata();
  if (!width || !height) {
    return { belowTarget: 0, worst: 21, warning: null };
  }

  // Resolve `object-fit: cover` the same way the browser will, so the region
  // measured is the region that prints.
  const boxAspect = policy.hero.w / policy.hero.h;
  let originX = 0;
  let originY = 0;
  let pxPerPt: number;
  if (width / height > boxAspect) {
    const visibleWidth = height * boxAspect;
    originX = (width - visibleWidth) / 2;
    pxPerPt = visibleWidth / policy.hero.w;
  } else {
    const visibleHeight = width / boxAspect;
    originY = (height - visibleHeight) / 2;
    pxPerPt = width / policy.hero.w;
  }

  const { x, y, w, h } = policy.textBox;
  const left = Math.max(0, Math.round(originX + x * pxPerPt));
  const top = Math.max(0, Math.round(originY + y * pxPerPt));
  const cropW = Math.min(Math.round(w * pxPerPt), width - left);
  const cropH = Math.min(Math.round(h * pxPerPt), height - top);
  if (cropW <= 0 || cropH <= 0) {
    return { belowTarget: 0, worst: 21, warning: null };
  }

  // Downsample before reading pixels: the statistic is a tail fraction over a
  // large area, and a 400px-wide sample answers it just as well as 1600 while
  // costing a fraction of the memory. Kernel stays default (Lanczos) so a
  // narrow bright strip survives the resize rather than being averaged away —
  // averaging it away is the exact failure this function exists to catch.
  const { data, info } = await image
    .extract({ left, top, width: cropW, height: cropH })
    .resize({ width: Math.min(400, cropW) })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const [tr, tg, tb] = SCRIM_TINT;
  const a = policy.textColumnAlpha;
  const total = info.width * info.height;
  let below = 0;
  let worst = 21;

  for (let i = 0; i < data.length; i += 3) {
    // Composite the scrim over the pixel, then measure.
    const r = data[i] * (1 - a) + tr * a;
    const g = data[i + 1] * (1 - a) + tg * a;
    const b = data[i + 2] * (1 - a) + tb * a;
    const luminance =
      0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
    const contrast = contrastWithWhite(luminance);
    if (contrast < policy.minContrast) below++;
    if (contrast < worst) worst = contrast;
  }

  const belowTarget = total ? below / total : 0;
  const warning =
    belowTarget > TOLERANCE
      ? `這張圖有 ${(belowTarget * 100).toFixed(1)}% 的文字區偏亮，` +
        `${policy.label} 封面的標題壓上去可能會糊（該版型最小 ${policy.minTypePt}pt，` +
        `需要 ${policy.minContrast}:1，最暗處只有 ${worst.toFixed(1)}:1）。` +
        `已經存起來了 —— 想換的話，主體放左邊、右側留白的照片最合適。`
      : null;

  return { belowTarget, worst, warning };
}

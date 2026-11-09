import { Point2D, RulerCalibrationLine } from "@/types/livery";

export interface ParsedBlueprintResult {
  fileType: "PDF" | "IMAGE";
  fileName: string;
  pageNumber: number;
  totalPages: number;
  widthPx: number;
  heightPx: number;
  renderedDataUrl: string;
  detectedBackground: "LIGHT_POH" | "DARK_CAD";
  inkCoveragePct: number;
  suggestedRulers: RulerCalibrationLine[];
  detectedAspectRatio: {
    lengthToHeightRatio: number;
    estimatedHeightFromLengthM: (lengthM: number) => number;
  };
}

const SUPPORTED_IMAGE_EXTENSIONS = [
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".svg",
  ".bmp",
  ".gif",
  ".avif",
];

export function isPdfFile(file: File): boolean {
  return (
    file.type === "application/pdf" ||
    file.name.toLowerCase().endsWith(".pdf")
  );
}

export function isSupportedDrawingFile(file: File): boolean {
  if (isPdfFile(file)) return true;
  if (file.type.startsWith("image/")) return true;
  const lower = file.name.toLowerCase();
  return SUPPORTED_IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * Loads a PDF file using pdfjs-dist and renders the specified page number (1-indexed)
 * to an HTML5 Canvas. Also returns total page count for multi-page POH/CAD PDFs.
 */
async function renderPdfPageToCanvas(
  file: File,
  pageNumber = 1,
  maxDimensionPx = 2200
): Promise<{ canvas: HTMLCanvasElement; totalPages: number; actualPage: number }> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdfDoc = await loadingTask.promise;

  const totalPages = pdfDoc.numPages;
  const actualPage = Math.max(1, Math.min(totalPages, pageNumber));
  const page = await pdfDoc.getPage(actualPage);

  const baseViewport = page.getViewport({ scale: 1.0 });
  const scale = Math.min(
    3.0,
    Math.max(1.5, maxDimensionPx / Math.max(baseViewport.width, baseViewport.height))
  );
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext("2d")!;

  // Fill white backing in case PDF has transparent background
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({
    canvasContext: ctx,
    viewport,
  }).promise;

  return { canvas, totalPages, actualPage };
}

/**
 * Loads a standard image format (.png, .jpg, .webp, .svg, .bmp, .gif, .avif) into an HTML5 Canvas.
 */
async function renderImageFileToCanvas(
  file: File,
  maxDimensionPx = 2200
): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const rawW = img.naturalWidth || img.width || 1200;
      const rawH = img.naturalHeight || img.height || 800;
      const scale = Math.min(1, maxDimensionPx / Math.max(rawW, rawH));
      const w = Math.max(1, Math.round(rawW * scale));
      const h = Math.max(1, Math.round(rawH * scale));

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`Unable to decode image file: ${file.name}`));
    };
    img.src = objectUrl;
  });
}

/**
 * Scans the rendered blueprint canvas to detect drawing contours, background polarity
 * (light POH paper vs dark CAD schematic), and suggests initial 2-point calibration rulers.
 */
function analyzeBlueprintCanvas(
  canvas: HTMLCanvasElement,
  defaultWingspanM = 9.53,
  defaultLengthM = 7.175,
  defaultHeightM = 2.45
): {
  detectedBackground: "LIGHT_POH" | "DARK_CAD";
  inkCoveragePct: number;
  suggestedRulers: RulerCalibrationLine[];
  lengthToHeightRatio: number;
} {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext("2d")!;
  const imgData = ctx.getImageData(0, 0, w, h).data;

  // 1. Sample average luminance to classify Light POH vs Dark CAD blueprint
  let lumSum = 0;
  let sampleCount = 0;
  const step = Math.max(2, Math.floor(Math.min(w, h) / 250));

  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const idx = (y * w + x) * 4;
      const lum =
        0.299 * imgData[idx] +
        0.587 * imgData[idx + 1] +
        0.114 * imgData[idx + 2];
      lumSum += lum;
      sampleCount++;
    }
  }
  const avgLum = lumSum / Math.max(1, sampleCount);
  const detectedBackground = avgLum >= 128 ? "LIGHT_POH" : "DARK_CAD";

  // 2. Find bounding box of ink/line pixels (ignoring 4% outer page border)
  const marginX = Math.floor(w * 0.04);
  const marginY = Math.floor(h * 0.04);
  let minX = w - marginX;
  let maxX = marginX;
  let minY = h - marginY;
  let maxY = marginY;
  let inkPixels = 0;
  let totalChecked = 0;

  for (let y = marginY; y < h - marginY; y += step) {
    for (let x = marginX; x < w - marginX; x += step) {
      const idx = (y * w + x) * 4;
      const lum =
        0.299 * imgData[idx] +
        0.587 * imgData[idx + 1] +
        0.114 * imgData[idx + 2];
      const isInk =
        detectedBackground === "LIGHT_POH" ? lum < avgLum - 32 : lum > avgLum + 32;
      totalChecked++;
      if (isInk) {
        inkPixels++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  // Fallback if image is low contrast
  if (maxX <= minX + 20 || maxY <= minY + 20) {
    minX = Math.floor(w * 0.08);
    maxX = Math.floor(w * 0.92);
    minY = Math.floor(h * 0.12);
    maxY = Math.floor(h * 0.88);
  }

  // Convert pixel bounds to normalized [0..1] blueprint coordinates
  // Note: Point2D in our calibrator has x in [0..1] left->right, y in [0..1] top->bottom
  const xLeftNorm = Number((minX / w).toFixed(3));
  const xRightNorm = Number((maxX / w).toFixed(3));
  const yTopNorm = Number((minY / h).toFixed(3));
  const yBotNorm = Number((maxY / h).toFixed(3));

  const boxWidthNorm = Math.max(0.2, xRightNorm - xLeftNorm);
  const boxHeightNorm = Math.max(0.2, yBotNorm - yTopNorm);

  // Place suggested Length, Height, and Wingspan rulers ergonomically within the detected drawing bounds
  const suggestedRulers: RulerCalibrationLine[] = [
    {
      id: "ruler-length",
      label: "Overall Fuselage Length (Spinner to Rudder TE)",
      axis: "LENGTH",
      p1: {
        x: Number((xLeftNorm + boxWidthNorm * 0.04).toFixed(3)),
        y: Number((yTopNorm + boxHeightNorm * 0.45).toFixed(3)),
      },
      p2: {
        x: Number((xLeftNorm + boxWidthNorm * 0.62).toFixed(3)),
        y: Number((yTopNorm + boxHeightNorm * 0.45).toFixed(3)),
      },
      measuredMeters: defaultLengthM,
    },
    {
      id: "ruler-height",
      label: "Overall Tail Height (Ground to Fin Tip)",
      axis: "HEIGHT",
      p1: {
        x: Number((xLeftNorm + boxWidthNorm * 0.58).toFixed(3)),
        y: Number((yTopNorm + boxHeightNorm * 0.14).toFixed(3)),
      },
      p2: {
        x: Number((xLeftNorm + boxWidthNorm * 0.58).toFixed(3)),
        y: Number((yTopNorm + boxHeightNorm * 0.48).toFixed(3)),
      },
      measuredMeters: defaultHeightM,
    },
    {
      id: "ruler-span",
      label: "Total Wingspan (Port Tip to Starboard Tip)",
      axis: "WINGSPAN",
      p1: {
        x: Number((xLeftNorm + boxWidthNorm * 0.15).toFixed(3)),
        y: Number((yTopNorm + boxHeightNorm * 0.82).toFixed(3)),
      },
      p2: {
        x: Number((xLeftNorm + boxWidthNorm * 0.88).toFixed(3)),
        y: Number((yTopNorm + boxHeightNorm * 0.82).toFixed(3)),
      },
      measuredMeters: defaultWingspanM,
    },
  ];

  const inkCoveragePct = Number(
    ((inkPixels / Math.max(1, totalChecked)) * 100).toFixed(1)
  );

  return {
    detectedBackground,
    inkCoveragePct,
    suggestedRulers,
    lengthToHeightRatio: Number((defaultLengthM / defaultHeightM).toFixed(2)),
  };
}

/**
 * Main entry point: parses either a PDF (.pdf) or any common image format
 * (.png, .jpg, .jpeg, .webp, .svg, .bmp, .gif, .avif), renders the chosen page,
 * and extracts contour bounds & interactive calibration rulers.
 */
export async function parseDrawingFile(
  file: File,
  pageNumber = 1,
  currentDims = { wingspanM: 9.53, lengthM: 7.175, heightM: 2.45 }
): Promise<ParsedBlueprintResult> {
  if (!isSupportedDrawingFile(file)) {
    throw new Error(
      `Unsupported file format "${file.name}". Please upload a PDF (.pdf) or common image (.png, .jpg, .webp, .svg, .bmp).`
    );
  }

  if (isPdfFile(file)) {
    const { canvas, totalPages, actualPage } = await renderPdfPageToCanvas(
      file,
      pageNumber
    );
    const analysis = analyzeBlueprintCanvas(
      canvas,
      currentDims.wingspanM,
      currentDims.lengthM,
      currentDims.heightM
    );

    return {
      fileType: "PDF",
      fileName: file.name,
      pageNumber: actualPage,
      totalPages,
      widthPx: canvas.width,
      heightPx: canvas.height,
      renderedDataUrl: canvas.toDataURL("image/png"),
      detectedBackground: analysis.detectedBackground,
      inkCoveragePct: analysis.inkCoveragePct,
      suggestedRulers: analysis.suggestedRulers,
      detectedAspectRatio: {
        lengthToHeightRatio: analysis.lengthToHeightRatio,
        estimatedHeightFromLengthM: (lenM: number) =>
          Number((lenM / analysis.lengthToHeightRatio).toFixed(2)),
      },
    };
  } else {
    const canvas = await renderImageFileToCanvas(file);
    const analysis = analyzeBlueprintCanvas(
      canvas,
      currentDims.wingspanM,
      currentDims.lengthM,
      currentDims.heightM
    );

    return {
      fileType: "IMAGE",
      fileName: file.name,
      pageNumber: 1,
      totalPages: 1,
      widthPx: canvas.width,
      heightPx: canvas.height,
      renderedDataUrl: canvas.toDataURL("image/png"),
      detectedBackground: analysis.detectedBackground,
      inkCoveragePct: analysis.inkCoveragePct,
      suggestedRulers: analysis.suggestedRulers,
      detectedAspectRatio: {
        lengthToHeightRatio: analysis.lengthToHeightRatio,
        estimatedHeightFromLengthM: (lenM: number) =>
          Number((lenM / analysis.lengthToHeightRatio).toFixed(2)),
      },
    };
  }
}

/**
 * Computes pixel length of a calibration ruler on a drawing of size (widthPx, heightPx).
 */
export function getRulerPixelLength(
  ruler: RulerCalibrationLine,
  widthPx: number,
  heightPx: number
): number {
  const dx = (ruler.p2.x - ruler.p1.x) * widthPx;
  const dy = (ruler.p2.y - ruler.p1.y) * heightPx;
  return Math.hypot(dx, dy);
}

/**
 * Given a reference ruler (e.g. Wingspan = 9.53m) and the current pixel lengths of all rulers
 * on a uniform-scale 3-view drawing, derives proportional metric dimensions for the other axes.
 */
export function deriveProportionalDimensionsFromReferenceRuler(
  rulers: RulerCalibrationLine[],
  referenceAxis: "WINGSPAN" | "LENGTH" | "HEIGHT",
  widthPx: number,
  heightPx: number
): { wingspanM: number; lengthM: number; heightM: number } | null {
  const refRuler = rulers.find((r) => r.axis === referenceAxis);
  if (!refRuler) return null;

  const refPx = getRulerPixelLength(refRuler, widthPx, heightPx);
  if (refPx < 5) return null;

  const metersPerPixel = refRuler.measuredMeters / refPx;

  const spanRuler = rulers.find((r) => r.axis === "WINGSPAN");
  const lenRuler = rulers.find((r) => r.axis === "LENGTH");
  const heightRuler = rulers.find((r) => r.axis === "HEIGHT");

  const wingspanM = spanRuler
    ? Number(
        Math.max(
          5.0,
          Math.min(18.0, getRulerPixelLength(spanRuler, widthPx, heightPx) * metersPerPixel)
        ).toFixed(2)
      )
    : 9.53;

  const lengthM = lenRuler
    ? Number(
        Math.max(
          4.5,
          Math.min(14.0, getRulerPixelLength(lenRuler, widthPx, heightPx) * metersPerPixel)
        ).toFixed(3)
      )
    : 7.175;

  const heightM = heightRuler
    ? Number(
        Math.max(
          1.5,
          Math.min(5.0, getRulerPixelLength(heightRuler, widthPx, heightPx) * metersPerPixel)
        ).toFixed(2)
      )
    : 2.45;

  return { wingspanM, lengthM, heightM };
}

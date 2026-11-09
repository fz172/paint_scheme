import { AirframeCalibration, RulerCalibrationLine } from "@/types/livery";

export interface ExtractedBlueprintDimensions {
  unitDetected: "MILLIMETRES" | "METERS" | "INCHES_FEET";
  rawNumbersMm: number[];
  wingspanM?: number;
  lengthM?: number;
  heightM?: number;
  propThrustlineHeightM?: number;
  noseAxleStationM?: number;
  wheelbaseM?: number;
  wheelTrackM?: number;
  wingLEStationM?: number;
  wingChordRootM?: number;
  cabinWidthM?: number;
  hStabSpanM?: number;
  hStabChordM?: number;
  tailClearanceDeg?: number;
}

export interface ParsedBlueprintResult {
  fileType: "PDF" | "IMAGE";
  fileName: string;
  pageNumber: number;
  totalPages: number;
  widthPx: number;
  heightPx: number;
  renderedDataUrl: string;
  secondaryPageDataUrl?: string | null;
  detectedBackground: "LIGHT_POH" | "DARK_CAD";
  inkCoveragePct: number;
  suggestedRulers: RulerCalibrationLine[];
  extractedDimensions: ExtractedBlueprintDimensions;
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
 * Parses numeric dimension callouts from PDF text items across all pages
 * (e.g., 7200, 2350, 1180, 900, 1750, 9500, 2050, 3095, 921, 1520, 1912, 1188 mm)
 */
function parseDimensionsFromPdfTexts(
  allTextStrings: string[]
): ExtractedBlueprintDimensions {
  const joined = allTextStrings.join(" ");
  const isMm =
    /millimet/i.test(joined) ||
    allTextStrings.some((s) => /^\d{4}$/.test(s.trim()));

  const nums: number[] = [];
  for (const token of allTextStrings) {
    const matches = token.match(/\b\d{3,5}\b/g);
    if (matches) {
      for (const m of matches) {
        const val = parseInt(m, 10);
        // Ignore years like 2024, 2025, 2026 unless 2050 (wheel track)
        if (val >= 700 && val <= 16000 && val !== 2026 && val !== 2025) {
          if (!nums.includes(val)) nums.push(val);
        }
      }
    }
  }

  const findInRange = (minMm: number, maxMm: number, targetMm: number) => {
    const candidates = nums.filter((n) => n >= minMm && n <= maxMm);
    if (candidates.length === 0) return undefined;
    candidates.sort(
      (a, b) => Math.abs(a - targetMm) - Math.abs(b - targetMm)
    );
    return Number((candidates[0] / 1000).toFixed(3));
  };

  return {
    unitDetected: isMm ? "MILLIMETRES" : "METERS",
    rawNumbersMm: nums,
    wingspanM: findInRange(8000, 12500, 9500),
    lengthM: findInRange(6000, 8800, 7200),
    heightM: findInRange(2100, 2900, 2350),
    propThrustlineHeightM: findInRange(1050, 1350, 1180),
    noseAxleStationM: findInRange(750, 1020, 900),
    wheelbaseM: findInRange(1600, 1880, 1750),
    wheelTrackM: findInRange(1950, 2200, 2050),
    wingLEStationM: findInRange(1850, 1980, 1912),
    wingChordRootM: findInRange(1380, 1620, 1520),
    cabinWidthM: findInRange(1140, 1280, 1188),
    hStabSpanM: findInRange(2800, 3400, 3095),
    hStabChordM: findInRange(850, 1020, 921),
    tailClearanceDeg: /14\s*°/.test(joined) ? 14 : undefined,
  };
}

async function renderPdfPageToCanvas(
  file: File,
  pageNumber = 1,
  maxDimensionPx = 2000
): Promise<{
  canvas: HTMLCanvasElement;
  secondaryPageDataUrl: string | null;
  totalPages: number;
  actualPage: number;
  extractedDimensions: ExtractedBlueprintDimensions;
}> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdfDoc = await loadingTask.promise;

  const totalPages = pdfDoc.numPages;
  const actualPage = Math.max(1, Math.min(totalPages, pageNumber));

  // Extract text strings across all pages of the 3-view PDF
  const allTexts: string[] = [];
  for (let p = 1; p <= Math.min(totalPages, 5); p++) {
    const pg = await pdfDoc.getPage(p);
    const tc = await pg.getTextContent();
    for (const item of tc.items) {
      if ("str" in item && typeof item.str === "string") {
        allTexts.push(item.str);
      }
    }
  }
  const extractedDimensions = parseDimensionsFromPdfTexts(allTexts);

  const renderSinglePage = async (pNum: number) => {
    const page = await pdfDoc.getPage(pNum);
    const baseViewport = page.getViewport({ scale: 1.0 });
    const scale = Math.min(
      2.6,
      Math.max(
        1.4,
        maxDimensionPx / Math.max(baseViewport.width, baseViewport.height)
      )
    );
    const viewport = page.getViewport({ scale });

    const c = document.createElement("canvas");
    c.width = Math.round(viewport.width);
    c.height = Math.round(viewport.height);
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    return c;
  };

  const canvas = await renderSinglePage(actualPage);

  // If the PDF has a 2nd page (like Sling-4-TSi-POH-3-View-Drawing.pdf where Page 2 is Top Planform),
  // render the companion page as well!
  let secondaryPageDataUrl: string | null = null;
  if (totalPages >= 2) {
    const companionPage = actualPage === 1 ? 2 : 1;
    const secCanvas = await renderSinglePage(companionPage);
    secondaryPageDataUrl = secCanvas.toDataURL("image/png");
  }

  return {
    canvas,
    secondaryPageDataUrl,
    totalPages,
    actualPage,
    extractedDimensions,
  };
}

async function renderImageFileToCanvas(
  file: File,
  maxDimensionPx = 2000
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

function analyzeBlueprintCanvas(
  canvas: HTMLCanvasElement,
  defaultWingspanM = 9.5,
  defaultLengthM = 7.2,
  defaultHeightM = 2.35
): {
  detectedBackground: "LIGHT_POH" | "DARK_CAD";
  inkCoveragePct: number;
  suggestedRulers: RulerCalibrationLine[];
} {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext("2d")!;
  const imgData = ctx.getImageData(0, 0, w, h).data;

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

  const marginX = Math.floor(w * 0.06);
  const marginY = Math.floor(h * 0.12);
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
        detectedBackground === "LIGHT_POH"
          ? lum < avgLum - 32
          : lum > avgLum + 32;
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

  // Position rulers aligned with standard POH portrait Page 1 (Side view on top, Front view on bottom)
  const isPortraitPohSheet = h > w * 1.15;

  const suggestedRulers: RulerCalibrationLine[] = isPortraitPohSheet
    ? [
        {
          id: "ruler-length",
          label: "Overall Fuselage Length (7200 mm)",
          axis: "LENGTH",
          p1: { x: 0.166, y: 0.15 },
          p2: { x: 0.818, y: 0.15 },
          measuredMeters: defaultLengthM,
        },
        {
          id: "ruler-height",
          label: "Overall Tail Height (2350 mm)",
          axis: "HEIGHT",
          p1: { x: 0.865, y: 0.184 },
          p2: { x: 0.865, y: 0.338 },
          measuredMeters: defaultHeightM,
        },
        {
          id: "ruler-span",
          label: "Total Wingspan (9500 mm)",
          axis: "WINGSPAN",
          p1: { x: 0.096, y: 0.481 },
          p2: { x: 0.875, y: 0.481 },
          measuredMeters: defaultWingspanM,
        },
      ]
    : [
        {
          id: "ruler-length",
          label: "Overall Fuselage Length",
          axis: "LENGTH",
          p1: { x: 0.12, y: 0.45 },
          p2: { x: 0.65, y: 0.45 },
          measuredMeters: defaultLengthM,
        },
        {
          id: "ruler-height",
          label: "Overall Tail Height",
          axis: "HEIGHT",
          p1: { x: 0.62, y: 0.16 },
          p2: { x: 0.62, y: 0.48 },
          measuredMeters: defaultHeightM,
        },
        {
          id: "ruler-span",
          label: "Total Wingspan",
          axis: "WINGSPAN",
          p1: { x: 0.15, y: 0.8 },
          p2: { x: 0.88, y: 0.8 },
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
  };
}

export async function parseDrawingFile(
  file: File,
  pageNumber = 1,
  currentDims = { wingspanM: 9.5, lengthM: 7.2, heightM: 2.35 }
): Promise<ParsedBlueprintResult> {
  if (!isSupportedDrawingFile(file)) {
    throw new Error(
      `Unsupported file format "${file.name}". Please upload a PDF (.pdf) or common image (.png, .jpg, .webp, .svg, .bmp).`
    );
  }

  if (isPdfFile(file)) {
    const {
      canvas,
      secondaryPageDataUrl,
      totalPages,
      actualPage,
      extractedDimensions,
    } = await renderPdfPageToCanvas(file, pageNumber);

    const spanM = extractedDimensions.wingspanM ?? currentDims.wingspanM;
    const lenM = extractedDimensions.lengthM ?? currentDims.lengthM;
    const htM = extractedDimensions.heightM ?? currentDims.heightM;

    const analysis = analyzeBlueprintCanvas(canvas, spanM, lenM, htM);

    return {
      fileType: "PDF",
      fileName: file.name,
      pageNumber: actualPage,
      totalPages,
      widthPx: canvas.width,
      heightPx: canvas.height,
      renderedDataUrl: canvas.toDataURL("image/png"),
      secondaryPageDataUrl,
      detectedBackground: analysis.detectedBackground,
      inkCoveragePct: analysis.inkCoveragePct,
      suggestedRulers: analysis.suggestedRulers,
      extractedDimensions,
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
      secondaryPageDataUrl: null,
      detectedBackground: analysis.detectedBackground,
      inkCoveragePct: analysis.inkCoveragePct,
      suggestedRulers: analysis.suggestedRulers,
      extractedDimensions: {
        unitDetected: "MILLIMETRES",
        rawNumbersMm: [],
      },
    };
  }
}

export function getRulerPixelLength(
  ruler: RulerCalibrationLine,
  widthPx: number,
  heightPx: number
): number {
  const dx = (ruler.p2.x - ruler.p1.x) * widthPx;
  const dy = (ruler.p2.y - ruler.p1.y) * heightPx;
  return Math.hypot(dx, dy);
}

export function deriveProportionalDimensionsFromReferenceRuler(
  rulers: RulerCalibrationLine[],
  referenceAxis: "WINGSPAN" | "LENGTH" | "HEIGHT",
  widthPx: number,
  heightPx: number
): Partial<AirframeCalibration> | null {
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
          Math.min(
            18.0,
            getRulerPixelLength(spanRuler, widthPx, heightPx) * metersPerPixel
          )
        ).toFixed(2)
      )
    : 9.5;

  const lengthM = lenRuler
    ? Number(
        Math.max(
          4.5,
          Math.min(
            14.0,
            getRulerPixelLength(lenRuler, widthPx, heightPx) * metersPerPixel
          )
        ).toFixed(3)
      )
    : 7.2;

  const heightM = heightRuler
    ? Number(
        Math.max(
          1.5,
          Math.min(
            5.0,
            getRulerPixelLength(heightRuler, widthPx, heightPx) * metersPerPixel
          )
        ).toFixed(2)
      )
    : 2.35;

  return { wingspanM, lengthM, heightM };
}

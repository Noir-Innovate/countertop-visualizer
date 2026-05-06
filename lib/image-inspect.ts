import { createHash } from "crypto";

export interface ImageInspection {
  byteLength: number;
  base64Length: number;
  /** First 16 bytes hex — useful magic-number sniff */
  magicHex: string;
  /** sha256 fingerprint, first 16 hex chars */
  fingerprint: string;
  /** Detected format from magic bytes */
  detectedFormat: "jpeg" | "png" | "gif" | "webp" | "heic" | "tiff" | "unknown";
  /** Decoded dimensions when detectable (JPEG SOFx + PNG IHDR) */
  width: number | null;
  height: number | null;
  /** Heuristic flags worth a console.warn */
  warnings: string[];
}

function detectFormat(bytes: Buffer): ImageInspection["detectedFormat"] {
  if (bytes.length < 12) return "unknown";
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "jpeg";
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  )
    return "png";
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "gif";
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  )
    return "webp";
  // HEIC: ftyp box at offset 4, brand at offset 8
  if (
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  ) {
    const brand = bytes.slice(8, 12).toString("ascii");
    if (
      brand === "heic" ||
      brand === "heix" ||
      brand === "mif1" ||
      brand === "msf1" ||
      brand === "hevc" ||
      brand === "hevx"
    )
      return "heic";
  }
  if (
    (bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2a) ||
    (bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0x00)
  )
    return "tiff";
  return "unknown";
}

function readJpegDimensions(
  bytes: Buffer,
): { width: number; height: number } | null {
  // JPEG: scan markers until SOF0..SOF3 / SOF5..SOF7 / SOF9..SOFB / SOFD..SOFF
  let i = 2; // skip SOI
  while (i < bytes.length - 8) {
    if (bytes[i] !== 0xff) return null;
    let marker = bytes[i + 1];
    while (marker === 0xff && i + 2 < bytes.length) {
      i += 1;
      marker = bytes[i + 1];
    }
    const isSOF =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (isSOF) {
      const height = bytes.readUInt16BE(i + 5);
      const width = bytes.readUInt16BE(i + 7);
      return { width, height };
    }
    if (marker === 0xd8 || marker === 0xd9) {
      i += 2;
      continue;
    }
    const segLen = bytes.readUInt16BE(i + 2);
    if (segLen < 2) return null;
    i += 2 + segLen;
  }
  return null;
}

function readPngDimensions(
  bytes: Buffer,
): { width: number; height: number } | null {
  // IHDR chunk starts at byte 16 after the 8-byte signature + 4-byte length + "IHDR"
  if (bytes.length < 24) return null;
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  return { width, height };
}

const SUSPICIOUSLY_SMALL = 5_000;

export function inspectImage(base64Data: string): ImageInspection {
  const bytes = Buffer.from(base64Data, "base64");
  const magicHex = bytes.slice(0, 16).toString("hex");
  const fingerprint = createHash("sha256")
    .update(bytes)
    .digest("hex")
    .slice(0, 16);
  const detectedFormat = detectFormat(bytes);

  let dims: { width: number; height: number } | null = null;
  if (detectedFormat === "jpeg") dims = readJpegDimensions(bytes);
  else if (detectedFormat === "png") dims = readPngDimensions(bytes);

  const warnings: string[] = [];
  if (bytes.length < SUSPICIOUSLY_SMALL) {
    warnings.push(
      `image is only ${bytes.length} bytes — likely blank/corrupt`,
    );
  }
  if (detectedFormat === "unknown") {
    warnings.push(`unrecognized magic bytes: ${magicHex}`);
  }
  if (detectedFormat === "heic") {
    warnings.push(
      "HEIC bytes received — Gemini may not understand this format; client compression likely failed",
    );
  }
  if (dims && (dims.width < 64 || dims.height < 64)) {
    warnings.push(`tiny dimensions ${dims.width}x${dims.height}`);
  }

  return {
    byteLength: bytes.length,
    base64Length: base64Data.length,
    magicHex,
    fingerprint,
    detectedFormat,
    width: dims?.width ?? null,
    height: dims?.height ?? null,
    warnings,
  };
}

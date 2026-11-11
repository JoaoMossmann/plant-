import jpeg from "jpeg-js";
import { PNG } from "pngjs";
import { Buffer } from "node:buffer";

export const MAX_BYTES = 2 * 1024 * 1024;
const MAX_SIDE = 1600;
const MAX_PIXELS = 1500000;

export class PhotoError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

function dimensions(width, height) {
  if (
    !width ||
    !height ||
    width > MAX_SIDE ||
    height > MAX_SIDE ||
    width * height > MAX_PIXELS
  )
    throw new PhotoError(413, "image_dimensions");
  return { width, height };
}

function inspect(bytes, mime) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (mime === "image/png") {
    if (
      bytes.length < 33 ||
      [137, 80, 78, 71, 13, 10, 26, 10].some((v, i) => bytes[i] !== v)
    )
      throw new PhotoError(415, "invalid_image");
    let offset = 8,
      headers = 0,
      ended = false,
      size;
    while (offset + 12 <= bytes.length) {
      const length = view.getUint32(offset);
      if (offset + 12 + length > bytes.length)
        throw new PhotoError(415, "invalid_image");
      const type = String.fromCharCode(
        ...bytes.subarray(offset + 4, offset + 8),
      );
      if (offset === 8 && (type !== "IHDR" || length !== 13))
        throw new PhotoError(415, "invalid_image");
      if (type === "IHDR") {
        if (++headers !== 1 || length !== 13)
          throw new PhotoError(415, "invalid_image");
        size = dimensions(
          view.getUint32(offset + 8),
          view.getUint32(offset + 12),
        );
      }
      if (["acTL", "fcTL", "fdAT"].includes(type))
        throw new PhotoError(415, "animated_image");
      offset += 12 + length;
      if (type === "IEND") {
        if (length !== 0 || offset !== bytes.length)
          throw new PhotoError(415, "invalid_image");
        ended = true;
        break;
      }
    }
    if (!ended || headers !== 1) throw new PhotoError(415, "invalid_image");
    return size;
  }
  if (
    mime !== "image/jpeg" ||
    bytes.length < 4 ||
    bytes[0] !== 255 ||
    bytes[1] !== 216
  )
    throw new PhotoError(415, "invalid_image");
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset++] !== 255) throw new PhotoError(415, "invalid_image");
    while (bytes[offset] === 255) offset++;
    const marker = bytes[offset++];
    if (marker === 218 || marker === 217) break;
    if (offset + 2 > bytes.length) break;
    const length = view.getUint16(offset);
    if (length < 2 || offset + length > bytes.length) break;
    if ([192, 193, 194].includes(marker)) {
      if (length < 8) break;
      return dimensions(view.getUint16(offset + 5), view.getUint16(offset + 3));
    }
    offset += length;
  }
  throw new PhotoError(415, "invalid_image");
}

// Só JPEG/PNG estáticos. A interface já converte arquivos selecionados para JPEG.
// Arquivos WebP antigos continuam legíveis, mas não são aceitos como novo upload.
export function normalizePhoto(bytes, mime) {
  if (!bytes.length || bytes.length > MAX_BYTES)
    throw new PhotoError(413, "image_size");
  const expected = inspect(bytes, mime);
  try {
    const raw =
      mime === "image/png"
        ? PNG.sync.read(
            Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength),
            { checkCRC: true },
          )
        : jpeg.decode(bytes, {
            useTArray: true,
            tolerantDecoding: false,
            maxResolutionInMP: 1.5,
            maxMemoryUsageInMB: 48,
          });
    dimensions(raw.width, raw.height);
    if (
      raw.width !== expected.width ||
      raw.height !== expected.height ||
      raw.data.length !== raw.width * raw.height * 4
    )
      throw new PhotoError(415, "invalid_image");
    const scale = Math.min(1, 1000 / Math.max(raw.width, raw.height));
    const width = Math.max(1, Math.round(raw.width * scale));
    const height = Math.max(1, Math.round(raw.height * scale));
    const data = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const source =
          (Math.min(raw.height - 1, Math.floor(y / scale)) * raw.width +
            Math.min(raw.width - 1, Math.floor(x / scale))) *
          4;
        const target = (y * width + x) * 4;
        const alpha = raw.data[source + 3] / 255;
        for (let channel = 0; channel < 3; channel++)
          data[target + channel] = Math.round(
            raw.data[source + channel] * alpha + 255 * (1 - alpha),
          );
        data[target + 3] = 255;
      }
    // Novo bitmap: não repassa EXIF, comentários, GPS ou bytes anexados ao original.
    const encoded = new Uint8Array(
      jpeg.encode({ width, height, data }, 80).data,
    );
    if (encoded.length > MAX_BYTES) throw new PhotoError(413, "image_size");
    return encoded;
  } catch (error) {
    if (error instanceof PhotoError) throw error;
    throw new PhotoError(415, "invalid_image");
  }
}

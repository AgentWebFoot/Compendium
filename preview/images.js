import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { imageFormats, isImageName } from "../src/images.js";

const maxBytes = 5 * 1024 * 1024;
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function matchesFormat(bytes, extension) {
  if (extension === "png") return bytes.subarray(0, 8).equals(pngSignature);
  if (extension === "jpg") return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  return bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
}

export async function saveImage(directory, request) {
  const mime = request.headers["content-type"];
  if (!Object.hasOwn(imageFormats, mime)) {
    return { status: 415, error: "Choose a PNG, JPEG, or WebP image." };
  }

  const chunks = [];
  let size = 0;
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > maxBytes) {
      request.resume();
      return { status: 413, error: "Images must be 5 MB or smaller." };
    }
    chunks.push(chunk);
  }

  const bytes = Buffer.concat(chunks);
  const extension = imageFormats[mime];
  if (!matchesFormat(bytes, extension)) {
    return { status: 415, error: "The upload does not match its image type." };
  }
  let original;
  try {
    original = decodeURIComponent(request.headers["x-compendium-filename"] ?? "");
  } catch {
    return { status: 400, error: "The image filename is invalid." };
  }
  const slug = original.toLowerCase().replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "image";
  const name = `${slug}-${randomUUID().slice(0, 8)}.${extension}`;
  await mkdir(directory, { recursive: true });
  await writeFile(new URL(name, directory), bytes, { flag: "wx" });
  return { status: 201, name };
}

export async function readImage(directory, name) {
  if (!isImageName(name)) return null;
  const extension = name.split(".").at(-1).toLowerCase();
  const type = extension === "jpeg" ? "image/jpeg" : Object.keys(imageFormats)
    .find(mime => imageFormats[mime] === extension);
  try {
    return { type, bytes: await readFile(new URL(name, directory)) };
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "EISDIR") return null;
    throw error;
  }
}


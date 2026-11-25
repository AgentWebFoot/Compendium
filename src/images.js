export const imageFormats = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export function isImageName(name) {
  return typeof name === "string" && /^[a-z0-9][a-z0-9._-]{0,119}\.(?:png|jpe?g|webp)$/i.test(name);
}


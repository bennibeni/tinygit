// src/lib/tinygit/sha1.js
import { bytesToHex } from "./codec";

export async function sha1Hex(bytes) {
  if (!globalThis.crypto?.subtle) {
    throw new Error(
      "WebCrypto not available (need secure context like https/localhost)."
    );
  }
  const digest = await crypto.subtle.digest("SHA-1", bytes);
  return bytesToHex(new Uint8Array(digest));
}

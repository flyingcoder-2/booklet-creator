/** Content address for the asset store: the SHA-256 hex digest of the given bytes. */
export async function sha256Hex(
  bytes: ArrayBuffer | Uint8Array,
): Promise<string> {
  // Always copy into a plain ArrayBuffer-backed view: `bytes` may be a
  // Uint8Array over a SharedArrayBuffer, which SubtleCrypto rejects.
  const view = new Uint8Array(bytes)
  const digest = await crypto.subtle.digest('SHA-256', view)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

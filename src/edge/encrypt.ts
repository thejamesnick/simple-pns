/**
 * Web Push Payload Encryption — Web Crypto implementation
 * ───────────────────────────────────────────────────────
 * Encrypts payloads using RFC 8188 (aes128gcm) content encoding
 * with ECDH key agreement via the Web Crypto API.
 */

function base64UrlEncode(data: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...data));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(base64 + padding);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    bytes[i] = raw.charCodeAt(i);
  }
  return bytes;
}

function generateSalt(): Uint8Array {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  return salt;
}

/**
 * HKDF via Web Crypto API — extract + expand in one call.
 */
async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  length: number,
): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, [
    "deriveBits",
  ]);
  return crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info },
    key,
    length,
  );
}

/**
 * Build context info string per RFC 8188:
 *   info = "Content-Encoding: <type>\0" || 2-byte key-length || recipient-key
 */
function buildContextInfo(
  type: "aes128gcm" | "nonce",
  recipientKey: Uint8Array,
): Uint8Array {
  const prefix = `Content-Encoding: ${type}\0`;
  const prefixBytes = new TextEncoder().encode(prefix);

  const lenBytes = new Uint8Array(2);
  lenBytes[0] = (recipientKey.byteLength >> 8) & 0xff;
  lenBytes[1] = recipientKey.byteLength & 0xff;

  const result = new Uint8Array(prefixBytes.length + 2 + recipientKey.length);
  result.set(prefixBytes, 0);
  result.set(lenBytes, prefixBytes.length);
  result.set(recipientKey, prefixBytes.length + 2);
  return result;
}

/**
 * Encrypt a notification payload for Web Push.
 *
 * @param payload              The JSON-stringified notification payload.
 * @param subscriptionKey      subscription.keys.p256dh (URL-safe base64).
 * @returns                    Encrypted body, salt, and server public key.
 */
export async function encryptPayload(
  payload: string,
  subscriptionKey: string,
): Promise<{
  body: Uint8Array;
  salt: string;
  serverPublicKey: string;
}> {
  const subPubRaw = base64UrlDecode(subscriptionKey);

  // Generate ephemeral ECDH key pair
  const ephemeral = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );

  // Export ephemeral public key
  const ephemPubRaw = await crypto.subtle.exportKey("raw", ephemeral.publicKey);
  const ephemPubKey = new Uint8Array(ephemPubRaw);

  // Import subscriber's public key
  const subPubKey = await crypto.subtle.importKey(
    "raw",
    subPubRaw,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );

  // Derive shared secret (256 bits)
  const sharedSecret = await crypto.subtle.deriveBits(
    { name: "ECDH", public: subPubKey },
    ephemeral.privateKey,
    256,
  );
  const sharedSecretBytes = new Uint8Array(sharedSecret);

  // Generate random salt
  const salt = generateSalt();

  // Derive Content Encryption Key (128 bits)
  const cekInfo = buildContextInfo("aes128gcm", subPubRaw);
  const cek = new Uint8Array(await hkdf(salt, sharedSecretBytes, cekInfo, 128));

  // Derive Nonce (96 bits)
  const nonceInfo = buildContextInfo("nonce", subPubRaw);
  const nonce = new Uint8Array(
    await hkdf(salt, sharedSecretBytes, nonceInfo, 96),
  );

  // Build plaintext: payload || 0x02 (padding delimiter, no trailing padding)
  const payloadBytes = new TextEncoder().encode(payload);
  const plaintext = new Uint8Array(payloadBytes.length + 1);
  plaintext.set(payloadBytes, 0);
  plaintext[payloadBytes.length] = 0x02;

  // Encrypt with AES-128-GCM
  const aesKey = await crypto.subtle.importKey(
    "raw",
    cek,
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce, tagLength: 128 },
    aesKey,
    plaintext,
  );
  const encryptedBytes = new Uint8Array(encrypted);

  // Build RFC 8188 body: salt (16) || record-size (4) || key-length (1) || key (65) || ciphertext+tag
  const recordSize = new Uint8Array([0x00, 0x00, 0x10, 0x00]); // 4096 bytes big-endian
  const keyLen = new Uint8Array([ephemPubKey.length]);

  const body = new Uint8Array(
    salt.length +
      recordSize.length +
      keyLen.length +
      ephemPubKey.length +
      encryptedBytes.length,
  );

  let offset = 0;
  body.set(salt, offset);
  offset += salt.length;
  body.set(recordSize, offset);
  offset += recordSize.length;
  body.set(keyLen, offset);
  offset += keyLen.length;
  body.set(ephemPubKey, offset);
  offset += ephemPubKey.length;
  body.set(encryptedBytes, offset);

  return {
    body,
    salt: base64UrlEncode(salt),
    serverPublicKey: base64UrlEncode(ephemPubKey),
  };
}

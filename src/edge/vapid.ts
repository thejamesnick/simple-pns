/**
 * VAPID JWT — Web Crypto implementation
 * ─────────────────────────────────────
 * Generates a signed JWT for VAPID authorization using
 * ES256 (ECDSA P-256) via the Web Crypto API.
 */

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

function base64UrlEncode(data: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...data));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function extractXY(rawKey: Uint8Array): { x: Uint8Array; y: Uint8Array } {
  if (rawKey[0] !== 0x04 || rawKey.length !== 65) {
    throw new Error(
      "VAPID public key must be 65 bytes in uncompressed format (0x04 prefix)",
    );
  }
  return {
    x: rawKey.slice(1, 33),
    y: rawKey.slice(33, 65),
  };
}

/**
 * Build VAPID Authorization and Crypto-Key headers.
 */
export async function buildVapidHeader(
  audience: string,
  subject: string,
  publicKey: string,
  privateKey: string,
  expiry?: number,
): Promise<{ authorization: string; cryptoKey: string }> {
  const exp = expiry ?? Math.floor(Date.now() / 1000) + 43200;

  const pubRaw = base64UrlDecode(publicKey);
  const privRaw = base64UrlDecode(privateKey);
  const { x, y } = extractXY(pubRaw);

  const header = { typ: "JWT", alg: "ES256" };
  const payload = { aud: audience, exp, sub: subject };

  const encoder = new TextEncoder();
  const headerB64 = base64UrlEncode(encoder.encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const signingInput = encoder.encode(`${headerB64}.${payloadB64}`);

  // JWK-formatted key for Web Crypto import
  const jwk = {
    kty: "EC",
    crv: "P-256",
    x: base64UrlEncode(x),
    y: base64UrlEncode(y),
    d: base64UrlEncode(privRaw),
    key_ops: ["sign"],
    ext: true,
  };

  const key = await crypto.subtle.importKey(
    "jwk",
    jwk as any,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    signingInput,
  );

  const sigBytes = new Uint8Array(signature);
  const jwt = `${headerB64}.${payloadB64}.${base64UrlEncode(sigBytes)}`;
  const pubKeyBase64 = base64UrlEncode(pubRaw);

  return {
    authorization: `vapid t=${jwt}, k=${pubKeyBase64}`,
    cryptoKey: `p256ecdsa=${pubKeyBase64}`,
  };
}

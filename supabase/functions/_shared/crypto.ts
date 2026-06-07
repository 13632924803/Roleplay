const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((value) => {
    binary += String.fromCharCode(value);
  });
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const normalized = value.trim();
  const binary = atob(normalized);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function deriveKeyBytes(secret: string): Uint8Array {
  let decoded: Uint8Array;
  try {
    decoded = base64ToBytes(secret);
  } catch {
    throw new Error("API_KEY_ENCRYPTION_SECRET must be valid base64.");
  }
  if (decoded.byteLength !== 16 && decoded.byteLength !== 24 && decoded.byteLength !== 32) {
    throw new Error(
      "API_KEY_ENCRYPTION_SECRET must decode to 16/24/32 bytes (recommend 32).",
    );
  }
  return decoded;
}

async function importAesKey(secret: string): Promise<CryptoKey> {
  const keyBytes = deriveKeyBytes(secret);
  return crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  const keyBytes = deriveKeyBytes(secret);
  return crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

function getSecret(): string {
  const secret = Deno.env.get("API_KEY_ENCRYPTION_SECRET");
  if (!secret) {
    throw new Error("Missing API_KEY_ENCRYPTION_SECRET.");
  }
  return secret;
}

export async function encryptApiKey(apiKey: string): Promise<{
  encrypted_api_key: string;
  encryption_iv: string;
  encryption_alg: "AES-GCM";
  encryption_key_version: "v1";
}> {
  const secret = getSecret();
  const key = await importAesKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    textEncoder.encode(apiKey),
  );

  return {
    encrypted_api_key: bytesToBase64(new Uint8Array(encrypted)),
    encryption_iv: bytesToBase64(iv),
    encryption_alg: "AES-GCM",
    encryption_key_version: "v1",
  };
}

export async function decryptApiKey(encryptedApiKey: string, ivBase64: string): Promise<string> {
  const secret = getSecret();
  const key = await importAesKey(secret);
  const decrypted = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: base64ToBytes(ivBase64),
    },
    key,
    base64ToBytes(encryptedApiKey),
  );
  return textDecoder.decode(decrypted);
}

export async function createKeyFingerprint(apiKey: string): Promise<string> {
  const secret = getSecret();
  const hmacKey = await importHmacKey(secret);
  const signature = await crypto.subtle.sign("HMAC", hmacKey, textEncoder.encode(apiKey));
  return Array.from(new Uint8Array(signature))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

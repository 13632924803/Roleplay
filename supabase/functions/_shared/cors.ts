const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
  "http://localhost:4174",
  "http://127.0.0.1:4174",
];

function normalizeOrigin(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function getAllowedOrigins(): string[] {
  const envOrigins = [Deno.env.get("APP_PUBLIC_URL"), Deno.env.get("ALLOWED_APP_ORIGIN")]
    .filter((value): value is string => Boolean(value))
    .map(normalizeOrigin);
  return [...new Set([...DEFAULT_ALLOWED_ORIGINS, ...envOrigins])];
}

export function buildCorsHeaders(origin: string | null): HeadersInit {
  const allowedOrigins = getAllowedOrigins();
  const allowedOrigin = origin ? normalizeOrigin(origin) : DEFAULT_ALLOWED_ORIGINS[0];
  const corsOrigin = allowedOrigins.includes(allowedOrigin) ? allowedOrigin : allowedOrigins[0];

  return {
    "Access-Control-Allow-Origin": corsOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    Vary: "Origin",
  };
}

export function handleCorsPreflight(request: Request): Response | null {
  if (request.method !== "OPTIONS") return null;
  return new Response("ok", {
    headers: buildCorsHeaders(request.headers.get("origin")),
  });
}

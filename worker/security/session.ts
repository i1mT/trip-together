const encoder = new TextEncoder();

async function signingKey(env: Env) {
  if (!env.SESSION_SIGNING_KEY || env.SESSION_SIGNING_KEY.length < 32)
    throw new Error("Session signing key is not configured");
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(env.SESSION_SIGNING_KEY),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function payload(request: Request, token: string) {
  return encoder.encode(
    `travel-session-v1:${new URL(request.url).host}:${token}`,
  );
}

export async function signSession(request: Request, env: Env, token: string) {
  const signature = await crypto.subtle.sign(
    "HMAC",
    await signingKey(env),
    payload(request, token),
  );
  const hex = [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `${token}.${hex}`;
}

export function bearerToken(request: Request) {
  return (
    request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1] ?? ""
  );
}

export async function verifiedCredential(
  request: Request,
  env: Env,
  value: string,
) {
  const match = value.match(/^([a-f0-9]{64})\.([a-f0-9]{64})$/);
  if (!match) return null;
  const signature = Uint8Array.from(match[2].match(/../g)!, (byte) =>
    parseInt(byte, 16),
  );
  const valid = await crypto.subtle.verify(
    "HMAC",
    await signingKey(env),
    signature,
    payload(request, match[1]),
  );
  return valid ? match[1] : null;
}

export async function verifiedSession(request: Request, env: Env) {
  return verifiedCredential(
    request,
    env,
    request.headers
      .get("cookie")
      ?.match(/(?:^|;\s*)travel_session=([^;]+)/)?.[1] ?? "",
  );
}

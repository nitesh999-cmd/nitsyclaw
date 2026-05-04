export function isSameOriginRequest(request: Request): boolean {
  const expectedOrigin = new URL(request.url).origin;
  const origin = request.headers.get("origin");
  if (origin) {
    return normalizeOrigin(origin) === expectedOrigin;
  }

  const referer = request.headers.get("referer");
  if (referer) {
    return normalizeOrigin(referer) === expectedOrigin;
  }

  return false;
}

export function requireSameOrigin(request: Request): Response | null {
  if (isSameOriginRequest(request)) return null;

  return new Response("Invalid request origin", {
    status: 403,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

function normalizeOrigin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

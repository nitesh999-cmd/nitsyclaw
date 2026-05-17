const NO_STORE = { "Cache-Control": "no-store" };

function constantTimeEqual(a: string, b: string): boolean {
  const max = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < max; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

export function requireBuildAgentAuth(request: Request): Response | null {
  const password = process.env.NITSYCLAW_DASHBOARD_PASSWORD;
  if (!password) {
    return new Response("Build agent endpoint not configured", { status: 503, headers: NO_STORE });
  }

  const authHeader = request.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return new Response("Authorization required", { status: 401, headers: NO_STORE });
  }

  const token = authHeader.slice("Bearer ".length);
  if (!constantTimeEqual(token, password)) {
    return new Response("Invalid token", { status: 403, headers: NO_STORE });
  }

  return null;
}

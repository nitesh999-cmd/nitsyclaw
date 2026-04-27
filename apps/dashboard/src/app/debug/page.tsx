// Diagnostic page - shows which environment variables are actually visible
// at SSR runtime. Hit /debug to see the truth.

export const dynamic = "force-dynamic";

export default function DebugPage() {
  const keys = [
    "DATABASE_URL",
    "DATABASE_URL_DIRECT",
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
    "ENCRYPTION_KEY",
    "WHATSAPP_OWNER_NUMBER",
    "TIMEZONE",
    "MS_CLIENT_ID",
    "MS_TENANT_ID",
    "MS_TOKEN_JSON",
    "GOOGLE_TOKEN_JSON",
    "GOOGLE_TOKEN_SOLARHARBOUR_JSON",
    "GOOGLE_CREDENTIALS_JSON",
    "NODE_ENV",
    "VERCEL",
    "VERCEL_ENV",
  ];

  const rows = keys.map((k) => {
    const v = process.env[k];
    let display = "<undefined>";
    if (v !== undefined) {
      if (v.length > 80) display = `${v.slice(0, 40)}... [${v.length} chars]`;
      else display = v;
      // Mask secrets
      if (k.includes("KEY") || k.includes("PASSWORD") || k.includes("SECRET") || k.includes("TOKEN")) {
        display = `<set, ${v.length} chars>`;
      }
      if (k === "DATABASE_URL" || k === "DATABASE_URL_DIRECT") {
        // Show shape but redact password
        display = v.replace(/:[^:@]+@/, ":<redacted>@");
      }
    }
    return { k, display, present: v !== undefined };
  });

  return (
    <div style={{ fontFamily: "monospace", padding: "2rem" }}>
      <h1>NitsyClaw Runtime Env Probe</h1>
      <p>This page shows which environment variables are actually accessible at SSR time.</p>
      <table style={{ borderCollapse: "collapse", marginTop: "1rem" }}>
        <thead>
          <tr style={{ borderBottom: "2px solid black" }}>
            <th style={{ textAlign: "left", padding: "0.5rem 1rem" }}>Key</th>
            <th style={{ textAlign: "left", padding: "0.5rem 1rem" }}>Value</th>
            <th style={{ textAlign: "left", padding: "0.5rem 1rem" }}>Present</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.k} style={{ borderBottom: "1px solid #ddd" }}>
              <td style={{ padding: "0.5rem 1rem" }}>{r.k}</td>
              <td style={{ padding: "0.5rem 1rem" }}>{r.display}</td>
              <td style={{ padding: "0.5rem 1rem", color: r.present ? "green" : "red" }}>
                {r.present ? "YES" : "NO"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ marginTop: "2rem", fontSize: "0.875rem", color: "#666" }}>
        If DATABASE_URL shows NO, the env is not reaching SSR. Check next.config.js env whitelist + Vercel env vars.
      </p>
    </div>
  );
}
// Diagnostic page — shows DATABASE_URL boundary characters and shape.
// Visit /debug after deploy to see exactly what the env contains at runtime.

export const dynamic = "force-dynamic";

interface DiagnosticRow {
  label: string;
  value: string;
}

export default function DebugPage(): JSX.Element {
  const v: string | undefined = process.env.DATABASE_URL;
  const head: string = v ? v.slice(0, 20) : "<undef>";
  const tail: string = v ? v.slice(-20) : "<undef>";
  const hasLeadingDouble: boolean = v?.startsWith('"') ?? false;
  const hasTrailingDouble: boolean = v?.endsWith('"') ?? false;
  const hasLeadingSingle: boolean = v?.startsWith("'") ?? false;
  const hasTrailingSingle: boolean = v?.endsWith("'") ?? false;
  const hasNewline: boolean = v ? /\r|\n/.test(v) : false;
  const hasLeadingSpace: boolean = v ? /^\s/.test(v) : false;
  const startsWithProto: boolean =
    (v?.startsWith("postgresql://") ?? false) ||
    (v?.startsWith("postgres://") ?? false);

  const rows: DiagnosticRow[] = [
    { label: "length", value: String(v?.length ?? "<undef>") },
    { label: "head (first 20)", value: JSON.stringify(head) },
    { label: "tail (last 20)", value: JSON.stringify(tail) },
    { label: "starts postgresql:// or postgres://", value: String(startsWithProto) },
    { label: "leading double-quote", value: String(hasLeadingDouble) },
    { label: "trailing double-quote", value: String(hasTrailingDouble) },
    { label: "leading single-quote", value: String(hasLeadingSingle) },
    { label: "trailing single-quote", value: String(hasTrailingSingle) },
    { label: "CR/LF inside", value: String(hasNewline) },
    { label: "leading whitespace", value: String(hasLeadingSpace) },
    { label: "NODE_ENV", value: String(process.env.NODE_ENV ?? "<undef>") },
    { label: "VERCEL_ENV", value: String(process.env.VERCEL_ENV ?? "<undef>") },
  ];

  return (
    <div style={{ padding: 24, fontFamily: "monospace", fontSize: 13 }}>
      <h1>NitsyClaw Runtime Env Diagnostics</h1>
      <p>What process.env.DATABASE_URL actually looks like at SSR time.</p>
      <table style={{ borderCollapse: "collapse", marginTop: 16 }}>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} style={{ borderBottom: "1px solid #ddd" }}>
              <td style={{ padding: "4px 16px 4px 0", color: "#555" }}>{r.label}</td>
              <td style={{ padding: "4px 0" }}>{r.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

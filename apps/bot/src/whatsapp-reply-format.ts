export interface WhatsAppReplyShape {
  answer: string;
  state?: string;
  details?: readonly string[];
  next?: string;
}

export function formatWhatsAppReplyShape(shape: WhatsAppReplyShape): string {
  const lines = [
    shape.answer,
    shape.state,
    ...(shape.details ?? []),
    shape.next ? `Next: ${shape.next}` : undefined,
  ].filter((line): line is string => Boolean(line?.trim()));

  return lines.join("\n");
}

export function whatsappReplyMetrics(reply: string): { lines: number; chars: number } {
  return {
    lines: reply.split("\n").length,
    chars: reply.length,
  };
}

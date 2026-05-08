export function normalizeWhatsAppOwnerId(value: string): string {
  return value.replace(/@c\.us$/i, "").replace(/\D/g, "");
}

export function isOwnerSelfChat(args: {
  from: string;
  fromMe?: boolean;
  to: string;
  chatId?: string;
  ownerNumber: string;
}): boolean {
  const owner = normalizeWhatsAppOwnerId(args.ownerNumber);
  if (!owner) return false;

  const chat = normalizeWhatsAppOwnerId(args.chatId ?? "");
  const to = normalizeWhatsAppOwnerId(args.to);

  if (args.chatId && chat !== owner) {
    return false;
  }

  if (args.fromMe === true && chat === owner) {
    return true;
  }

  if (args.fromMe === true && to === owner) {
    return true;
  }

  return (
    normalizeWhatsAppOwnerId(args.from) === owner &&
    to === owner
  );
}

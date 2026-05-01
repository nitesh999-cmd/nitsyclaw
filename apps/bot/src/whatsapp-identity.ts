export function normalizeWhatsAppOwnerId(value: string): string {
  return value.replace(/@c\.us$/i, "").replace(/\D/g, "");
}

export function isOwnerSelfChat(args: {
  from: string;
  fromMe?: boolean;
  to: string;
  ownerNumber: string;
}): boolean {
  const owner = normalizeWhatsAppOwnerId(args.ownerNumber);
  const to = normalizeWhatsAppOwnerId(args.to);

  if (args.fromMe === true && to === owner) {
    return true;
  }

  return (
    owner.length > 0 &&
    normalizeWhatsAppOwnerId(args.from) === owner &&
    to === owner
  );
}

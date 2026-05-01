export function normalizeWhatsAppOwnerId(value: string): string {
  return value.replace(/@c\.us$/i, "").replace(/\D/g, "");
}

export function isOwnerSelfChat(args: {
  from: string;
  to: string;
  ownerNumber: string;
}): boolean {
  const owner = normalizeWhatsAppOwnerId(args.ownerNumber);
  return (
    owner.length > 0 &&
    normalizeWhatsAppOwnerId(args.from) === owner &&
    normalizeWhatsAppOwnerId(args.to) === owner
  );
}

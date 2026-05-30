// Single source of truth for contact details and reusable copy.
// No fake data, no placeholder values — everything here is real and verified.

export const SITE = {
  name: "Nitesh Basudkar",
  role: "Sales & Operations Fixer",
  location: "Melbourne, Victoria",
  email: "nitesh999@gmail.com",
  phone: "+61 430 008 008",
  // E.164 without the plus, for wa.me links.
  whatsapp: "61430008008",
  linkedin: "https://www.linkedin.com/in/niteshbasudkar",
  url: "https://niteshbasudkar.com",
} as const;

// Pre-filled email so a busy owner can describe the mess in one tap.
export const EMAIL_SUBJECT = "Where my business is leaking revenue";
export const EMAIL_BODY = [
  "Hi Nitesh,",
  "",
  "Here is where I think we are leaking revenue / losing time:",
  "",
  "- ",
  "",
  "Business / industry:",
  "Team size:",
  "Best way to reach me:",
].join("\n");

export const mailtoHref = `mailto:${SITE.email}?subject=${encodeURIComponent(
  EMAIL_SUBJECT,
)}&body=${encodeURIComponent(EMAIL_BODY)}`;

const WHATSAPP_MESSAGE =
  "Hi Nitesh, I'd like a quick look at where my business is leaking revenue after the lead comes in.";

// Build a wa.me deep link with a custom pre-filled message.
export function whatsAppLink(message: string = WHATSAPP_MESSAGE): string {
  return `https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent(message)}`;
}

export const whatsappHref = whatsAppLink();

// Build a mailto with a custom subject/body.
export function mailtoLink(subject: string, body: string): string {
  return `mailto:${SITE.email}?subject=${encodeURIComponent(
    subject,
  )}&body=${encodeURIComponent(body)}`;
}

// Honest, owner-keepable promise (used near contact CTAs).
export const RESPONSE_LINE = "I usually reply the same day.";

// tel: link, digits only (keeps the leading +).
export const telHref = `tel:${SITE.phone.replace(/\s/g, "")}`;

export const NAV_LINKS = [
  { label: "The leaks", href: "#leaks" },
  { label: "Leak scan", href: "#scorecard" },
  { label: "Ways to start", href: "#offers" },
  { label: "FAQ", href: "#faq" },
  { label: "Contact", href: "#contact" },
] as const;

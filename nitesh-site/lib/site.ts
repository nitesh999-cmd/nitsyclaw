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

export const whatsappHref = `https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent(
  WHATSAPP_MESSAGE,
)}`;

export const NAV_LINKS = [
  { label: "The leaks", href: "#leaks" },
  { label: "What I fix", href: "#fix" },
  { label: "Ways to start", href: "#offers" },
  { label: "Method", href: "#method" },
  { label: "About", href: "#about" },
] as const;

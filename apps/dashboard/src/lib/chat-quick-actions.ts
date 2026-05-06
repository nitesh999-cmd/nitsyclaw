export type ChatQuickActionId =
  | "sort-actions"
  | "clean-note"
  | "draft-reply"
  | "compare-options"
  | "call-script"
  | "renewal-watch"
  | "complaint"
  | "check-message"
  | "travel-day"
  | "triage-admin";

export interface ChatQuickAction {
  id: ChatQuickActionId;
  label: string;
  helper: string;
  prompt: string;
}

export const CHAT_QUICK_ACTIONS: ChatQuickAction[] = [
  {
    id: "sort-actions",
    label: "Find my next steps",
    helper: "Turn a messy message into clear actions.",
    prompt: "Find my next steps from this: [paste messy note, message, or list here]",
  },
  {
    id: "clean-note",
    label: "Make this note tidy",
    helper: "Clean rough thoughts into a short note.",
    prompt: "Make this note tidy and easy to read: [paste rough note here]",
  },
  {
    id: "draft-reply",
    label: "Help me reply",
    helper: "Write a warm reply that sounds natural.",
    prompt: "Help me reply warmly. Situation: [paste message or context here]. I want to say: [paste intent here]",
  },
  {
    id: "compare-options",
    label: "Choose between options",
    helper: "Compare choices and pick the best one.",
    prompt: "Help me choose. Decision: [paste decision here]. Options: [paste options here]. What matters most: [paste priorities here]",
  },
  {
    id: "call-script",
    label: "Prepare a call",
    helper: "Get opening line, questions, and fallback text.",
    prompt: "Prepare a phone call for me. Contact: [paste contact here]. Goal: [paste goal here]. Facts: [paste useful facts here]",
  },
  {
    id: "renewal-watch",
    label: "Check renewals",
    helper: "Find renewals, cancellations, and notice dates.",
    prompt: "Check this for renewals or cancellation dates: [paste bill, contract, or message here]",
  },
  {
    id: "complaint",
    label: "Write a firm complaint",
    helper: "Clear, calm, and specific.",
    prompt: "Write a firm complaint. Company: [paste company here]. Issue: [paste issue here]. What I want: [paste outcome here]. Deadline: [paste deadline here]",
  },
  {
    id: "check-message",
    label: "Check before I send",
    helper: "Catch tone and private-number risks.",
    prompt: "Check before I send this and make it safer if needed: [paste message here]",
  },
  {
    id: "travel-day",
    label: "Plan travel day",
    helper: "A simple checklist for the day.",
    prompt: "Plan my travel day. Destination: [paste destination here]. Date: [paste date here]. Commitments: [paste flight, parking, documents, times here]",
  },
  {
    id: "triage-admin",
    label: "Sort life admin",
    helper: "Group what to pay, book, save, reply to, or decide.",
    prompt: "Sort this life admin into clear buckets: [paste mixed notes here]",
  },
];

export function findQuickActionById(id: string): ChatQuickAction | undefined {
  return CHAT_QUICK_ACTIONS.find((action) => action.id === id);
}

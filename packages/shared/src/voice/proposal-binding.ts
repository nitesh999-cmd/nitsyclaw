import { createHash, timingSafeEqual } from "node:crypto";

const BINDING_DOMAIN = "NITSYCLAW-VOICE-PROPOSAL-BINDING-V1";
const SHA256_HEX = /^[a-f0-9]{64}$/u;

export interface VoiceProposalIdentity {
  proposalId: string;
  ownerHash: string;
  conversationHash: string;
  policyVersion: string;
}

export interface VoiceProposalRecord extends VoiceProposalIdentity {
  tokenHash: string;
  tokenBindingHash: string;
  status: "pending" | "completed" | "cancelled" | "expired";
  expiresAtMs: number;
  cancelledAtMs: number | null;
  usedAtMs: number | null;
}

export interface VoiceProposalConfirmationRequest extends VoiceProposalIdentity {
  rawToken: string;
  accepted: boolean;
  nowMs: number;
}

export interface VoiceProposalBindingResult {
  bindingValid: boolean;
  confirmationUsable: boolean;
  externalActionAllowed: false;
  reason:
    | "proposal_missing"
    | "identity_mismatch"
    | "token_mismatch"
    | "expired"
    | "cancelled"
    | "used"
    | "state_not_pending"
    | "not_accepted"
    | "matched";
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function secureHexEqual(left: string, right: string): boolean {
  if (!SHA256_HEX.test(left) || !SHA256_HEX.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

export function createVoiceProposalTokenHashes(
  identity: VoiceProposalIdentity,
  rawToken: string,
): { tokenHash: string; tokenBindingHash: string } {
  const tokenHash = sha256(rawToken);
  const tokenBindingHash = sha256([
    BINDING_DOMAIN,
    identity.proposalId,
    identity.ownerHash,
    identity.conversationHash,
    identity.policyVersion,
    rawToken,
  ].join("\0"));
  return { tokenHash, tokenBindingHash };
}

export function evaluateVoiceProposalBinding(
  proposal: VoiceProposalRecord | null,
  request: VoiceProposalConfirmationRequest,
): VoiceProposalBindingResult {
  const rejected = (reason: VoiceProposalBindingResult["reason"]): VoiceProposalBindingResult => ({
    bindingValid: false,
    confirmationUsable: false,
    externalActionAllowed: false,
    reason,
  });

  if (!proposal) return rejected("proposal_missing");
  if (proposal.proposalId !== request.proposalId
    || proposal.ownerHash !== request.ownerHash
    || proposal.conversationHash !== request.conversationHash
    || proposal.policyVersion !== request.policyVersion) {
    return rejected("identity_mismatch");
  }

  const hashes = createVoiceProposalTokenHashes(request, request.rawToken);
  if (!secureHexEqual(proposal.tokenHash, hashes.tokenHash)
    || !secureHexEqual(proposal.tokenBindingHash, hashes.tokenBindingHash)) {
    return rejected("token_mismatch");
  }
  if (request.nowMs >= proposal.expiresAtMs || proposal.status === "expired") return rejected("expired");
  if (proposal.cancelledAtMs !== null || proposal.status === "cancelled") return rejected("cancelled");
  if (proposal.usedAtMs !== null) return rejected("used");
  if (proposal.status !== "pending") return rejected("state_not_pending");

  return {
    bindingValid: true,
    confirmationUsable: request.accepted,
    externalActionAllowed: false,
    reason: request.accepted ? "matched" : "not_accepted",
  };
}

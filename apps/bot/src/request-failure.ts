export class EmptyAgentResponseError extends Error {
  readonly code = "empty_response";

  constructor() {
    super("The agent completed without a usable WhatsApp reply.");
    this.name = "EmptyAgentResponseError";
  }
}

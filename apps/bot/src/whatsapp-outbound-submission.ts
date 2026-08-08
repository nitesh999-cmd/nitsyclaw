import { createHash, randomUUID } from "node:crypto";

export const WHATSAPP_ACK_ERROR = -1;
export const WHATSAPP_ACK_PENDING = 0;
export const WHATSAPP_ACK_SERVER = 1;
export const WHATSAPP_ACK_DEVICE = 2;

const ACK_STATE_VERSION = 1 as const;
const DEFAULT_SUBMISSION_TIMEOUT_MS = 45_000;
const DEFAULT_ACK_TIMEOUT_MS = 45_000;
const MAX_PERSISTED_ATTEMPTS = 100;
const MAX_EARLY_ACKS = 100;

export type WhatsAppOutboundDeliveryStage =
  | "no_evidence"
  | "local_self_echo_only"
  | "client_accepted_without_id"
  | "message_id_created_pending_ack"
  | "server_submitted"
  | "device_acknowledged"
  | "user_visible_confirmed";

export interface WhatsAppOutboundDeliveryEvidence {
  localSelfEchoObserved?: boolean;
  clientAccepted?: boolean;
  messageId?: string;
  ack?: number;
  userVisibleConfirmed?: boolean;
}

type WhatsAppAddress = string | {
  _serialized?: string;
  $1?: string;
  toString?: () => string;
};

export interface WhatsAppMessageKey {
  _serialized?: string;
  $1?: string;
  fromMe?: boolean;
  remote?: WhatsAppAddress;
  id?: string;
  self?: string;
  toString?: () => string;
}

export interface WhatsAppSubmissionMessage {
  id?: WhatsAppMessageKey;
  ack?: number;
  body?: string;
  fromMe?: boolean;
  to?: WhatsAppAddress;
  from?: WhatsAppAddress;
}

type WhatsAppAckListener = (message: WhatsAppSubmissionMessage, ack: number) => void;
type WhatsAppCreateListener = (message: WhatsAppSubmissionMessage) => void;

export interface WhatsAppSubmissionClient {
  sendMessage(
    target: string,
    content: unknown,
    options: { waitUntilMsgSent: true; sendAudioAsVoice?: boolean },
  ): Promise<WhatsAppSubmissionMessage | undefined>;
  on(event: "message_ack", listener: WhatsAppAckListener): unknown;
  on(event: "message_create", listener: WhatsAppCreateListener): unknown;
  off?(event: "message_ack", listener: WhatsAppAckListener): unknown;
  off?(event: "message_create", listener: WhatsAppCreateListener): unknown;
  removeListener?(event: "message_ack", listener: WhatsAppAckListener): unknown;
  removeListener?(event: "message_create", listener: WhatsAppCreateListener): unknown;
}

export type WhatsAppOutboundSubmissionErrorCode =
  | "submission_timeout"
  | "message_id_missing"
  | "recipient_missing"
  | "correlation_mismatch"
  | "ack_error"
  | "ack_timeout";

export class WhatsAppOutboundSubmissionError extends Error {
  constructor(
    readonly code: WhatsAppOutboundSubmissionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "WhatsAppOutboundSubmissionError";
  }
}

export interface WhatsAppOutboundSubmissionResult {
  id: string;
  ack: number;
  delivery: "server_submitted" | "device_acknowledged";
}

export interface PersistedWhatsAppOutboundAttempt {
  attemptId: string;
  requestedRecipientHash: string;
  bodyHash: string;
  createdAtMs: number;
  ackDeadlineAtMs: number;
  messageIdHash?: string;
  actualRecipientHash?: string;
  clientAccepted: boolean;
  localSelfEchoObserved: boolean;
  userVisibleConfirmed: boolean;
  ack: number;
  deadlineExpiredAtMs?: number;
  lateAck?: boolean;
}

export interface PersistedWhatsAppEarlyAck {
  messageIdHash: string;
  recipientHash: string;
  ack: number;
  observedAtMs: number;
}

export interface WhatsAppOutboundAckState {
  version: typeof ACK_STATE_VERSION;
  attempts: PersistedWhatsAppOutboundAttempt[];
  earlyAcks: PersistedWhatsAppEarlyAck[];
}

export interface WhatsAppOutboundAckStateStore {
  load(): Promise<unknown>;
  save(state: WhatsAppOutboundAckState): Promise<void>;
}

export class InMemoryWhatsAppOutboundAckStateStore implements WhatsAppOutboundAckStateStore {
  state: WhatsAppOutboundAckState | undefined;

  async load(): Promise<unknown> {
    return this.state ? structuredClone(this.state) : undefined;
  }

  async save(state: WhatsAppOutboundAckState): Promise<void> {
    this.state = structuredClone(state);
  }
}

export function classifyWhatsAppOutboundDelivery(
  evidence: WhatsAppOutboundDeliveryEvidence,
): WhatsAppOutboundDeliveryStage {
  if (evidence.userVisibleConfirmed) return "user_visible_confirmed";
  if (evidence.messageId && (evidence.ack ?? WHATSAPP_ACK_PENDING) >= WHATSAPP_ACK_DEVICE) {
    return "device_acknowledged";
  }
  if (evidence.messageId && (evidence.ack ?? WHATSAPP_ACK_PENDING) >= WHATSAPP_ACK_SERVER) {
    return "server_submitted";
  }
  if (evidence.messageId) return "message_id_created_pending_ack";
  if (evidence.clientAccepted) return "client_accepted_without_id";
  if (evidence.localSelfEchoObserved) return "local_self_echo_only";
  return "no_evidence";
}

function usableString(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed || trimmed === "[object Object]" || trimmed.length > 512 || /[\r\n\0]/.test(trimmed)) {
    return "";
  }
  return trimmed;
}

function addressString(value: WhatsAppAddress | undefined): string {
  if (typeof value === "string") return usableString(value).toLowerCase();
  if (!value) return "";
  const serialized = usableString(value._serialized);
  if (serialized) return serialized.toLowerCase();
  const projected = usableString(value.$1);
  if (projected) return projected.toLowerCase();
  if (typeof value.toString !== "function") return "";
  return usableString(value.toString()).toLowerCase();
}

/**
 * Supports legacy `_serialized`, raw MsgKey `toString()`, and current
 * whatsapp-web.js projected keys. In 1.34.7 `getMessageModel()` preserves the
 * raw canonical key in `$1` but strips the MsgKey prototype and `_serialized`.
 */
export function normalizeWhatsAppMessageId(id: WhatsAppMessageKey | undefined): string {
  if (!id) return "";
  const serialized = usableString(id._serialized);
  if (serialized) return serialized;
  const projected = usableString(id.$1);
  if (projected) return projected;
  if (typeof id.toString === "function") {
    const stringified = usableString(id.toString());
    if (stringified) return stringified;
  }
  const remote = addressString(id.remote);
  const token = usableString(id.id);
  const self = usableString(id.self);
  if (typeof id.fromMe !== "boolean" || !remote || !token) return "";
  return [String(id.fromMe), remote, token, self].filter(Boolean).join("_");
}

export function normalizeWhatsAppMessageRecipient(
  message: WhatsAppSubmissionMessage | undefined,
): string {
  if (!message) return "";
  const remote = addressString(message.id?.remote);
  if (remote) return remote;
  const to = addressString(message.to);
  if (to) return to;
  return message.fromMe ? addressString(message.from) : "";
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizedBodyHash(body: string, attemptId: string): string {
  return hash(`${attemptId}\0${body.replace(/\r\n/g, "\n").trim()}`);
}

function mergeAck(current: number, incoming: number): number {
  if (current === WHATSAPP_ACK_ERROR || incoming === WHATSAPP_ACK_ERROR) {
    return current >= WHATSAPP_ACK_SERVER ? current : WHATSAPP_ACK_ERROR;
  }
  return Math.max(current, incoming);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function sanitizeState(value: unknown): WhatsAppOutboundAckState {
  const input = value as Partial<WhatsAppOutboundAckState> | null;
  const attempts = Array.isArray(input?.attempts)
    ? input.attempts.filter((item): item is PersistedWhatsAppOutboundAttempt => {
        const record = item as Partial<PersistedWhatsAppOutboundAttempt> | null;
        return Boolean(
          record &&
          usableString(record.attemptId) &&
          usableString(record.requestedRecipientHash) &&
          usableString(record.bodyHash) &&
          isFiniteNumber(record.createdAtMs) &&
          isFiniteNumber(record.ackDeadlineAtMs) &&
          isFiniteNumber(record.ack),
        );
      }).slice(-MAX_PERSISTED_ATTEMPTS)
    : [];
  const earlyAcks = Array.isArray(input?.earlyAcks)
    ? input.earlyAcks.filter((item): item is PersistedWhatsAppEarlyAck => {
        const record = item as Partial<PersistedWhatsAppEarlyAck> | null;
        return Boolean(
          record &&
          usableString(record.messageIdHash) &&
          usableString(record.recipientHash) &&
          isFiniteNumber(record.ack) &&
          isFiniteNumber(record.observedAtMs),
        );
      }).slice(-MAX_EARLY_ACKS)
    : [];
  return { version: ACK_STATE_VERSION, attempts, earlyAcks };
}

function withDeadline<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutError: () => WhatsAppOutboundSubmissionError,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(timeoutError()), timeoutMs);
    void promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

interface AckWaiter {
  resolve: (ack: number) => void;
  reject: (error: WhatsAppOutboundSubmissionError) => void;
  timer: NodeJS.Timeout;
}

export class WhatsAppOutboundAckCoordinator {
  private state: WhatsAppOutboundAckState = {
    version: ACK_STATE_VERSION,
    attempts: [],
    earlyAcks: [],
  };
  private initialization?: Promise<void>;
  private persistChain: Promise<void> = Promise.resolve();
  private sendChain: Promise<void> = Promise.resolve();
  private attachedClient?: WhatsAppSubmissionClient;
  private activeAttemptId = "";
  private readonly observedCorrelations = new Map<string, { id: string; recipient: string }>();
  private readonly waiters = new Map<string, AckWaiter>();
  private readonly onAck = (message: WhatsAppSubmissionMessage, ack: number): void => {
    void this.observeAck(message, ack).catch(() => {
      // Persistence failure is fail-closed: no waiter is resolved and the send
      // reaches its bounded conditional timeout.
    });
  };
  private readonly onCreate = (message: WhatsAppSubmissionMessage): void => {
    void this.observeMessageCreate(message).catch(() => {
      // A self-echo is never delivery proof. Persistence failure cannot upgrade it.
    });
  };

  constructor(private readonly options: {
    store?: WhatsAppOutboundAckStateStore;
    now?: () => number;
    createAttemptId?: () => string;
  } = {}) {}

  private now(): number {
    return this.options.now?.() ?? Date.now();
  }

  private async initialize(): Promise<void> {
    if (!this.initialization) {
      this.initialization = (async () => {
        if (this.options.store) {
          this.state = sanitizeState(await this.options.store.load());
        }
        const now = this.now();
        let changed = false;
        for (const attempt of this.state.attempts) {
          if (
            attempt.ack < WHATSAPP_ACK_SERVER &&
            !attempt.deadlineExpiredAtMs &&
            attempt.ackDeadlineAtMs <= now
          ) {
            attempt.deadlineExpiredAtMs = now;
            changed = true;
          }
        }
        if (changed) await this.persist();
      })();
    }
    return this.initialization;
  }

  private snapshot(): WhatsAppOutboundAckState {
    return structuredClone(this.state);
  }

  private persist(): Promise<void> {
    if (!this.options.store) return Promise.resolve();
    const snapshot = this.snapshot();
    const write = this.persistChain.catch(() => undefined).then(() => this.options.store!.save(snapshot));
    this.persistChain = write;
    return write;
  }

  async getState(): Promise<WhatsAppOutboundAckState> {
    await this.initialize();
    return this.snapshot();
  }

  attach(client: WhatsAppSubmissionClient): void {
    if (this.attachedClient === client) return;
    this.detach();
    this.attachedClient = client;
    // Both observers exist before any submission can be queued.
    client.on("message_ack", this.onAck);
    client.on("message_create", this.onCreate);
    void this.initialize().catch(() => {
      // send() awaits the same initialization and fails before submission.
    });
  }

  detach(): void {
    if (!this.attachedClient) return;
    const client = this.attachedClient;
    if (client.off) {
      client.off("message_ack", this.onAck);
      client.off("message_create", this.onCreate);
    } else {
      client.removeListener?.("message_ack", this.onAck);
      client.removeListener?.("message_create", this.onCreate);
    }
    this.attachedClient = undefined;
  }

  private findAttempt(attemptId: string): PersistedWhatsAppOutboundAttempt {
    const attempt = this.state.attempts.find((item) => item.attemptId === attemptId);
    if (!attempt) throw new Error("WhatsApp outbound attempt not found");
    return attempt;
  }

  private consumeEarlyAck(attempt: PersistedWhatsAppOutboundAttempt): void {
    if (!attempt.messageIdHash || !attempt.actualRecipientHash) return;
    const matching = this.state.earlyAcks.filter((item) =>
      item.messageIdHash === attempt.messageIdHash &&
      item.recipientHash === attempt.actualRecipientHash
    );
    for (const item of matching) attempt.ack = mergeAck(attempt.ack, item.ack);
    this.state.earlyAcks = this.state.earlyAcks.filter((item) => !matching.includes(item));
  }

  private async observeMessageCreate(message: WhatsAppSubmissionMessage): Promise<void> {
    await this.initialize();
    if (!this.activeAttemptId || message.fromMe !== true || typeof message.body !== "string") return;
    const attempt = this.findAttempt(this.activeAttemptId);
    if (normalizedBodyHash(message.body, attempt.attemptId) !== attempt.bodyHash) return;
    attempt.localSelfEchoObserved = true;

    const id = normalizeWhatsAppMessageId(message.id);
    const recipient = normalizeWhatsAppMessageRecipient(message);
    if (id && recipient) {
      const idHash = hash(id);
      const recipientHash = hash(recipient);
      if (
        (attempt.messageIdHash && attempt.messageIdHash !== idHash) ||
        (attempt.actualRecipientHash && attempt.actualRecipientHash !== recipientHash)
      ) {
        return;
      }
      attempt.messageIdHash = idHash;
      attempt.actualRecipientHash = recipientHash;
      this.observedCorrelations.set(attempt.attemptId, { id, recipient });
      this.consumeEarlyAck(attempt);
    }
    await this.persist();
    this.notifyIfTerminal(attempt);
  }

  private async observeAck(message: WhatsAppSubmissionMessage, ack: number): Promise<void> {
    await this.initialize();
    if (!isFiniteNumber(ack)) return;
    const id = normalizeWhatsAppMessageId(message.id);
    const recipient = normalizeWhatsAppMessageRecipient(message);
    if (!id || !recipient) return;
    const idHash = hash(id);
    const recipientHash = hash(recipient);
    const attempt = this.state.attempts.find((item) =>
      item.messageIdHash === idHash && item.actualRecipientHash === recipientHash
    );
    if (!attempt) {
      const existing = this.state.earlyAcks.find((item) =>
        item.messageIdHash === idHash && item.recipientHash === recipientHash
      );
      if (existing) {
        existing.ack = mergeAck(existing.ack, ack);
        existing.observedAtMs = this.now();
      } else {
        this.state.earlyAcks.push({ messageIdHash: idHash, recipientHash, ack, observedAtMs: this.now() });
        this.state.earlyAcks = this.state.earlyAcks.slice(-MAX_EARLY_ACKS);
      }
      await this.persist();
      return;
    }

    const previousAck = attempt.ack;
    attempt.ack = mergeAck(attempt.ack, ack);
    if (attempt.deadlineExpiredAtMs && attempt.ack >= WHATSAPP_ACK_SERVER) attempt.lateAck = true;
    if (attempt.ack === previousAck) return;
    await this.persist();
    this.notifyIfTerminal(attempt);
  }

  private notifyIfTerminal(attempt: PersistedWhatsAppOutboundAttempt): void {
    if (attempt.ack !== WHATSAPP_ACK_ERROR && attempt.ack < WHATSAPP_ACK_SERVER) return;
    const waiter = this.waiters.get(attempt.attemptId);
    if (!waiter) return;
    clearTimeout(waiter.timer);
    this.waiters.delete(attempt.attemptId);
    if (attempt.ack === WHATSAPP_ACK_ERROR) {
      waiter.reject(new WhatsAppOutboundSubmissionError(
        "ack_error",
        "WhatsApp reported an outbound submission error.",
      ));
    } else {
      waiter.resolve(attempt.ack);
    }
  }

  private waitForAck(attempt: PersistedWhatsAppOutboundAttempt, timeoutMs: number): Promise<number> {
    if (attempt.ack === WHATSAPP_ACK_ERROR) {
      return Promise.reject(new WhatsAppOutboundSubmissionError(
        "ack_error",
        "WhatsApp reported an outbound submission error.",
      ));
    }
    if (attempt.ack >= WHATSAPP_ACK_SERVER) return Promise.resolve(attempt.ack);

    return new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters.delete(attempt.attemptId);
        attempt.deadlineExpiredAtMs = this.now();
        void this.persist().finally(() => reject(new WhatsAppOutboundSubmissionError(
          "ack_timeout",
          "WhatsApp created a message ID but did not provide a server acknowledgement before the bounded deadline. Delivery remains conditional.",
        )));
      }, timeoutMs);
      this.waiters.set(attempt.attemptId, { resolve, reject, timer });
    });
  }

  private async submitNow(
    client: WhatsAppSubmissionClient,
    args: {
      target: string;
      body: string;
      content?: unknown;
      sendOptions?: { sendAudioAsVoice?: boolean };
      submissionTimeoutMs?: number;
      ackTimeoutMs?: number;
    },
  ): Promise<WhatsAppOutboundSubmissionResult> {
    await this.initialize();
    if (this.attachedClient !== client) this.attach(client);
    const attemptId = this.options.createAttemptId?.() ?? randomUUID();
    const submissionTimeoutMs = args.submissionTimeoutMs ?? DEFAULT_SUBMISSION_TIMEOUT_MS;
    const ackTimeoutMs = args.ackTimeoutMs ?? DEFAULT_ACK_TIMEOUT_MS;
    const now = this.now();
    const attempt: PersistedWhatsAppOutboundAttempt = {
      attemptId,
      requestedRecipientHash: hash(addressString(args.target) || args.target.trim().toLowerCase()),
      bodyHash: normalizedBodyHash(args.body, attemptId),
      createdAtMs: now,
      ackDeadlineAtMs: now + submissionTimeoutMs + ackTimeoutMs,
      clientAccepted: false,
      localSelfEchoObserved: false,
      userVisibleConfirmed: false,
      ack: WHATSAPP_ACK_PENDING,
    };
    this.state.attempts.push(attempt);
    this.state.attempts = this.state.attempts.slice(-MAX_PERSISTED_ATTEMPTS);
    this.activeAttemptId = attemptId;

    // This write completes before sendMessage can emit message_create or ACK.
    await this.persist();
    try {
      const sent = await withDeadline(
        client.sendMessage(args.target, args.content ?? args.body, {
          waitUntilMsgSent: true,
          ...args.sendOptions,
        }),
        submissionTimeoutMs,
        () => new WhatsAppOutboundSubmissionError(
          "submission_timeout",
          "WhatsApp did not complete outbound submission before the timeout.",
        ),
      );
      attempt.clientAccepted = true;
      const observedCorrelation = this.observedCorrelations.get(attemptId);
      const id = normalizeWhatsAppMessageId(sent?.id) || observedCorrelation?.id || "";
      if (!id) {
        await this.persist();
        throw new WhatsAppOutboundSubmissionError(
          "message_id_missing",
          "WhatsApp accepted the local message model without returning a real message ID.",
        );
      }
      const recipient = normalizeWhatsAppMessageRecipient(sent) || observedCorrelation?.recipient || "";
      if (!recipient) {
        await this.persist();
        throw new WhatsAppOutboundSubmissionError(
          "recipient_missing",
          "WhatsApp returned a message ID without a correlatable outbound recipient.",
        );
      }
      const idHash = hash(id);
      const recipientHash = hash(recipient);
      if (
        (attempt.messageIdHash && attempt.messageIdHash !== idHash) ||
        (attempt.actualRecipientHash && attempt.actualRecipientHash !== recipientHash)
      ) {
        await this.persist();
        throw new WhatsAppOutboundSubmissionError(
          "correlation_mismatch",
          "WhatsApp local echo and send result did not identify the same outbound message and recipient.",
        );
      }
      attempt.messageIdHash = idHash;
      attempt.actualRecipientHash = recipientHash;
      attempt.ack = mergeAck(attempt.ack, sent?.ack ?? WHATSAPP_ACK_PENDING);
      attempt.ackDeadlineAtMs = this.now() + ackTimeoutMs;
      this.consumeEarlyAck(attempt);
      await this.persist();

      const ack = await this.waitForAck(attempt, ackTimeoutMs);
      return {
        id,
        ack,
        delivery: ack >= WHATSAPP_ACK_DEVICE ? "device_acknowledged" : "server_submitted",
      };
    } finally {
      this.observedCorrelations.delete(attemptId);
      if (this.activeAttemptId === attemptId) this.activeAttemptId = "";
    }
  }

  submit(
    client: WhatsAppSubmissionClient,
    args: {
      target: string;
      body: string;
      content?: unknown;
      sendOptions?: { sendAudioAsVoice?: boolean };
      submissionTimeoutMs?: number;
      ackTimeoutMs?: number;
    },
  ): Promise<WhatsAppOutboundSubmissionResult> {
    const run = this.sendChain.then(() => this.submitNow(client, args));
    this.sendChain = run.then(() => undefined, () => undefined);
    return run;
  }

  async confirmUserVisible(attemptId: string): Promise<void> {
    await this.initialize();
    this.findAttempt(attemptId).userVisibleConfirmed = true;
    await this.persist();
  }
}

const defaultCoordinators = new WeakMap<object, WhatsAppOutboundAckCoordinator>();

/** Backwards-compatible entrypoint used by focused tests and narrow callers. */
export function submitWhatsAppMessageWithServerAck(
  client: WhatsAppSubmissionClient,
  args: {
    target: string;
    body: string;
    content?: unknown;
    sendOptions?: { sendAudioAsVoice?: boolean };
    submissionTimeoutMs?: number;
    ackTimeoutMs?: number;
  },
): Promise<WhatsAppOutboundSubmissionResult> {
  let coordinator = defaultCoordinators.get(client as object);
  if (!coordinator) {
    coordinator = new WhatsAppOutboundAckCoordinator();
    coordinator.attach(client);
    defaultCoordinators.set(client as object, coordinator);
  }
  return coordinator.submit(client, args);
}

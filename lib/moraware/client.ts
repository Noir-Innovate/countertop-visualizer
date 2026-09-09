/**
 * Moraware JobTracker API (JTAPI) client — read-only.
 *
 * Moraware publishes no REST API. Their only supported client is a .NET
 * Framework 4.5 DLL that references System.Windows.Forms, which is why
 * integrating is usually assumed to need a Windows host. That DLL is only a
 * wrapper: the wire protocol is plain XML over HTTPS to
 * `https://<tenant>.moraware.net/api.aspx`, so we speak it directly and need no
 * Windows machine, no DLL, and no VM.
 *
 * Protocol facts verified against a live endpoint:
 *   - Root element <MorawareCommand version="5" ...>, response <MorawareResponse>.
 *   - Schema versions 1-6 are accepted; 6 is prerelease and additionally
 *     requires prereleaseVersion=1, so 5 is the stable target.
 *   - Errors come back as <error errorCode=".." errorCodeDescription=".."> with
 *     a <description>, including for authentication failures.
 *   - Every command except sessionCreate requires a session id.
 *
 * This client deliberately supports reads only. See assertReadOnly().
 */

export interface MorawareConfig {
  /** Tenant host, e.g. "acme" for acme.moraware.net, or a full hostname. */
  tenant: string;
  userName: string;
  password: string;
  /** Milliseconds; Moraware can be slow on wide queries. */
  timeoutMs?: number;
}

export class MorawareError extends Error {
  constructor(
    message: string,
    readonly code: string | null,
    readonly codeDescription: string | null,
  ) {
    super(message);
    this.name = "MorawareError";
  }
}

const SCHEMA_VERSION = "5";

/**
 * Commands are named <entity><Verb>, e.g. jobQuery, accountCreate. We allow
 * only the Query verb so a coding mistake cannot mutate a customer's system;
 * this is a hard guard, not a convention.
 */
function assertReadOnly(command: string): void {
  if (!/Query$/.test(command)) {
    throw new MorawareError(
      `Refusing to send "${command}": this client is read-only and only *Query commands are permitted.`,
      null,
      null,
    );
  }
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function baseUrl(tenant: string): string {
  const host = tenant.includes(".") ? tenant : `${tenant}.moraware.net`;
  return `https://${host}/api.aspx`;
}

/** Pulls the structured <error> out of a response, if present. */
function readError(xml: string): MorawareError | null {
  const tag = xml.match(
    /<error\s+errorCode="([^"]*)"\s+errorCodeDescription="([^"]*)"/,
  );
  if (!tag) return null;
  const description = xml.match(/<description>([\s\S]*?)<\/description>/);
  const detail = description
    ? description[1].replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim()
    : tag[2];
  return new MorawareError(detail, tag[1], tag[2]);
}

export class MorawareClient {
  private sessionId: string | null = null;

  constructor(private readonly config: MorawareConfig) {}

  private async post(body: string): Promise<string> {
    const res = await fetch(baseUrl(this.config.tenant), {
      method: "POST",
      headers: { "Content-Type": "text/xml" },
      body,
      signal: AbortSignal.timeout(this.config.timeoutMs ?? 60_000),
    });
    const text = await res.text();
    const err = readError(text);
    if (err) throw err;
    if (!res.ok) {
      throw new MorawareError(
        `Moraware returned HTTP ${res.status}`,
        String(res.status),
        null,
      );
    }
    return text;
  }

  /**
   * Opens a session. Moraware is reported to allow only one concurrent login
   * per account, so a session opened here may end a browser session for the
   * same user — use a dedicated integration account, not a person's login.
   */
  async login(): Promise<void> {
    const xml =
      `<MorawareCommand version="${SCHEMA_VERSION}"` +
      ` userName="${escapeXml(this.config.userName)}"` +
      ` password="${escapeXml(this.config.password)}">` +
      `<sessionCreate/></MorawareCommand>`;
    const res = await this.post(xml);
    const match = res.match(/<session[^>]*\bid="([^"]+)"/);
    if (!match) {
      throw new MorawareError(
        "sessionCreate returned no session id",
        null,
        null,
      );
    }
    this.sessionId = match[1];
  }

  /** Sends a read-only command and returns the raw response XML. */
  async query(command: string, innerXml = ""): Promise<string> {
    assertReadOnly(command);
    if (!this.sessionId) {
      throw new MorawareError("Not logged in — call login() first", null, null);
    }
    const xml =
      `<MorawareCommand version="${SCHEMA_VERSION}"` +
      ` sessionId="${escapeXml(this.sessionId)}">` +
      `<${command}>${innerXml}</${command}>` +
      `</MorawareCommand>`;
    return this.post(xml);
  }

  /** Always call this: it frees the single allowed session. */
  async logout(): Promise<void> {
    if (!this.sessionId) return;
    const xml =
      `<MorawareCommand version="${SCHEMA_VERSION}"` +
      ` sessionId="${escapeXml(this.sessionId)}">` +
      `<sessionLogout/></MorawareCommand>`;
    try {
      await this.post(xml);
    } finally {
      this.sessionId = null;
    }
  }
}

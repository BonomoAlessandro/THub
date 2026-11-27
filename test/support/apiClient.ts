// Echte HTTP-Anfragen an die lokale Schnittstelle, so wie sie der claude-Starter und die Hooks von
// Claude Code schicken, und Hook-Nutzdaten aus den im Spike aufgezeichneten Beispielen.

import * as fs from 'node:fs';
import * as http from 'node:http';

export interface ApiResponse {
  status: number;
  headers: http.IncomingHttpHeaders;
  /** Antwortinhalt als Text, leer bei leerer Antwort. */
  body: string;
  /** Millisekunden vom Absenden bis zur vollständigen Antwort. */
  ms: number;
}

export class ApiClient {
  /** @param token mitgeschicktes Token; `null` schickt keines */
  constructor(
    readonly url: string,
    readonly token: string | null,
  ) {}

  /** Derselbe Empfänger mit einem anderen (oder keinem) Token. */
  withToken(token: string | null): ApiClient {
    return new ApiClient(this.url, token);
  }

  /** POST mit JSON-Inhalt; ein Text geht unverändert hinaus (für kaputte Inhalte). */
  post(path: string, body: unknown, headers: Record<string, string> = {}): Promise<ApiResponse> {
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    const allHeaders: Record<string, string | number> = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(text),
      ...headers,
    };
    if (this.token !== null) allHeaders['X-THub-Token'] = this.token;
    return send(`${this.url}${path}`, 'POST', allHeaders, text);
  }

  get(path: string): Promise<ApiResponse> {
    const headers: Record<string, string> = {};
    if (this.token !== null) headers['X-THub-Token'] = this.token;
    return send(`${this.url}${path}`, 'GET', headers, '');
  }

  /** Meldung des Starters vor dem Start von Claude. */
  launch(request: Record<string, unknown>): Promise<ApiResponse> {
    return this.post('/claude/launch', request);
  }

  /** Meldung des Starters direkt nach dem Start von Claude. */
  started(tabId: string, pid: number): Promise<ApiResponse> {
    return this.post('/claude/started', { tabId, pid });
  }

  /** Meldung des Starters nach dem Ende von Claude. */
  exit(tabId: string, sessionId: string | undefined, exitCode: number): Promise<ApiResponse> {
    return this.post('/claude/exit', { tabId, sessionId, exitCode });
  }

  /** Hook-Ereignis, wie es Claude Code schickt: Tab in der Kopfzeile, Nutzdaten als Inhalt. */
  hook(tabId: string, event: string, payload: unknown): Promise<ApiResponse> {
    return this.post(`/hooks/${event}`, payload, { 'X-THub-Tab': tabId });
  }

  /** JSON der Statuszeile, wie es der Befehl `statusLine` der Hook-Datei weiterleitet (Ticket 38). */
  statusLine(tabId: string, payload: unknown): Promise<ApiResponse> {
    return this.post('/claude/statusline', payload, { 'X-THub-Tab': tabId });
  }

  /**
   * Ein Hook-Ereignis, dessen Kopfzeilen sofort und dessen Inhalt erst mit `finish` ankommt.
   * `arrived` erfüllt sich, sobald der Server die Anfrage angenommen hat (das erste Stück ist bei ihm).
   */
  slowHook(tabId: string, event: string, payload: unknown): { arrived: Promise<void>; finish: () => Promise<ApiResponse> } {
    const text = JSON.stringify(payload);
    const half = Math.floor(text.length / 2);
    let resolveResponse: (res: ApiResponse) => void;
    const response = new Promise<ApiResponse>((resolve) => (resolveResponse = resolve));
    const req = http.request(`${this.url}/hooks/${event}`, {
      method: 'POST',
      agent: false,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(text),
        'X-THub-Tab': tabId,
        'X-THub-Token': this.token ?? '',
      },
    });
    const started = performance.now();
    req.on('response', (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () =>
        resolveResponse({
          status: res.statusCode ?? 0,
          headers: res.headers,
          body: Buffer.concat(chunks).toString('utf8'),
          ms: performance.now() - started,
        }),
      );
    });
    const arrived = new Promise<void>((resolve) => {
      req.write(text.slice(0, half), () => setTimeout(resolve, 100));
    });
    return {
      arrived,
      finish: () => {
        req.end(text.slice(half));
        return response;
      },
    };
  }
}

/** Ohne Keep-Alive, damit nach jedem Test keine Verbindung zu einem geschlossenen Server übrig bleibt. */
function send(
  url: string,
  method: string,
  headers: Record<string, string | number>,
  body: string,
): Promise<ApiResponse> {
  const started = performance.now();
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method, headers, agent: false }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () =>
        resolve({
          status: res.statusCode ?? 0,
          headers: res.headers,
          body: Buffer.concat(chunks).toString('utf8'),
          ms: performance.now() - started,
        }),
      );
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end(body);
  });
}

/** Name einer aufgezeichneten Beispieldatei in spikes/claude-hooks/samples, ohne `.json`. */
export type HookSample =
  | 'SessionStart-startup'
  | 'SessionStart-resume'
  | 'SessionStart-clear'
  | 'SessionEnd-clear'
  | 'SessionEnd-other'
  | 'SessionEnd-prompt_input_exit'
  | 'UserPromptSubmit'
  | 'UserPromptSubmit-task-notification'
  | 'PreToolUse-Bash'
  | 'PreToolUse-Read'
  | 'PreToolUse-AskUserQuestion'
  | 'PermissionRequest-Bash'
  | 'PermissionRequest-Read'
  | 'PermissionRequest-AskUserQuestion'
  | 'PostToolUse-Bash'
  | 'PostToolUse-Read'
  | 'Stop'
  | 'Stop-mit-background_tasks'
  | 'Notification-idle_prompt'
  | 'Notification-permission_prompt'
  // Agenten (Ticket 37, Claude Code 2.1.332):
  | 'SubagentStart'
  | 'SubagentStop'
  | 'SubagentStop-helfer'
  | 'Stop-mit-agent'
  | 'UserPromptSubmit-agent-message'
  | 'UserPromptSubmit-task-notification-agent'
  | 'PreToolUse-Agent'
  | 'PostToolUse-Agent'
  | 'PreToolUse-Bash-aus-agent'
  | 'PostToolUse-Bash-aus-agent'
  | 'PermissionRequest-aus-agent';

const SAMPLES_DIR = new URL('../../spikes/claude-hooks/samples/', import.meta.url);

/**
 * Nutzdaten eines echten Hook-Ereignisses aus dem Spike (Claude Code 2.1.328), mit eigenen Werten
 * für Kennung, Ordner usw.
 */
export function hookPayload(sample: HookSample, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const recorded = JSON.parse(fs.readFileSync(new URL(`${sample}.json`, SAMPLES_DIR), 'utf8')) as {
    nutzdaten: Record<string, unknown>;
  };
  return { ...recorded.nutzdaten, ...overrides };
}

/**
 * JSON der Statuszeile aus dem Spike zu Ticket 38 (Claude Code 2.1.332, nach einer Antwort, mit Limits), mit eigenen
 * Werten; `rate_limits: undefined` lässt die Limits weg.
 */
export function statusLinePayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const recorded = JSON.parse(fs.readFileSync(new URL('StatusLine.json', SAMPLES_DIR), 'utf8')) as {
    nutzdaten: Record<string, unknown>;
  };
  const payload: Record<string, unknown> = { ...recorded.nutzdaten, ...overrides };
  for (const key of Object.keys(payload)) if (payload[key] === undefined) delete payload[key];
  return payload;
}

/** Das Ereignis einer Beispieldatei, z.B. `SessionEnd` für `SessionEnd-clear`. */
export function hookEvent(sample: HookSample): string {
  return sample.split('-')[0];
}

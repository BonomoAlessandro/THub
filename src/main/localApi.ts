// Lokale Schnittstelle (Ticket 10): ein kleiner HTTP-Server im Hauptprozess, nur auf 127.0.0.1, über den der
// claude-Starter und die Hooks von Claude Code den Workspace-Kern erreichen. Ein dünner Adapter: Er prüft das
// Token, liest die Anfrage und gibt sie an den Kern weiter; was sie bewirkt, entscheidet der Kern.
// Lädt nie Electron, damit die Kern-Tests ihn echt betreiben können.
//
// Endpunkte (alle POST, Token in der Kopfzeile `X-TermHub-Token`, sonst 403):
// - /claude/launch   {tabId, case, sessionId?, cwd?} → 200 {tabName, sessionId?, hookFile}; 404 bei unbekanntem Tab
// - /claude/started  {tabId, pid}                    → 200 leer
// - /claude/exit     {tabId, sessionId?, exitCode}   → 200 leer
// - /hooks/<Ereignis> Hook-Nutzdaten, Tab in `X-TermHub-Tab` → immer sofort 200 leer, nie Entscheidungsfelder

import { randomBytes, timingSafeEqual } from 'node:crypto';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import { LAUNCH_CASES, type ClaudeReceiver, type LaunchCase } from './workspace/claude';

const HOST = '127.0.0.1';
const TOKEN_HEADER = 'x-termhub-token';
const TAB_HEADER = 'x-termhub-tab';
/** Grössere Inhalte (etwa `PostToolUse` nach dem Lesen einer riesigen Datei) werden nicht ausgewertet. */
const MAX_BODY_BYTES = 8 * 1024 * 1024;
/** Eine Anfrage, die so lange nicht vollständig ankommt, wird abgebrochen; Claude wartet ohnehin nur 2 s. */
const REQUEST_TIMEOUT_MS = 10_000;
const STARTER_PATHS = new Set(['/claude/launch', '/claude/started', '/claude/exit']);

interface Reply {
  status: number;
  json?: object;
}

export class LocalApiServer {
  private receiver: ClaudeReceiver | null = null;
  /** Hook-Ereignisse gehen in der Reihenfolge ihres Eintreffens an den Kern, auch wenn ein Inhalt später fertig wird. */
  private hooksForwarded: Promise<void> = Promise.resolve();

  private constructor(
    private readonly server: http.Server,
    /** Adresse, z.B. "http://127.0.0.1:51234"; so steht sie in TERMHUB_API und in der Hook-Datei. */
    readonly url: string,
    /** Pro App-Start zufällig; jede Anfrage muss es mitschicken. */
    readonly token: string,
  ) {}

  /** Startet den Server auf einem zufälligen freien Port. */
  static start(): Promise<LocalApiServer> {
    let api: LocalApiServer | null = null;
    const server = http.createServer((req, res) => (api ? api.handle(req, res) : reply(res, { status: 503 })));
    server.requestTimeout = REQUEST_TIMEOUT_MS;
    server.headersTimeout = REQUEST_TIMEOUT_MS;
    return new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen({ host: HOST, port: 0 }, () => {
        server.off('error', reject);
        server.on('error', (err) => console.error('Lokale Schnittstelle:', err));
        const { port } = server.address() as AddressInfo;
        api = new LocalApiServer(server, `http://${HOST}:${port}`, randomBytes(32).toString('hex'));
        resolve(api);
      });
    });
  }

  /** Ab jetzt gehen die Anfragen an den Kern. Vorher antwortet der Starter-Teil mit 503. */
  connect(receiver: ClaudeReceiver): void {
    this.receiver = receiver;
  }

  close(): Promise<void> {
    return new Promise((resolve) => {
      this.server.close(() => resolve());
      this.server.closeAllConnections();
    });
  }

  private handle(req: http.IncomingMessage, res: http.ServerResponse): void {
    if (!this.hasValidToken(req)) return reply(res, { status: 403 });
    if (req.method !== 'POST') return reply(res, { status: 405 });
    const pathname = (req.url ?? '').split('?')[0];
    const hook = /^\/hooks\/([A-Za-z]+)$/.exec(pathname);
    if (hook) return this.onHook(req, res, hook[1]);
    if (!STARTER_PATHS.has(pathname)) return reply(res, { status: 404 });
    void readBody(req).then((text) => {
      if (text === null) return;
      let result: Reply;
      try {
        result = this.onStarter(pathname, parseJson(text));
      } catch (err) {
        console.error('Lokale Schnittstelle: Meldung des Starters konnte nicht verarbeitet werden:', err);
        result = { status: 500 };
      }
      reply(res, result);
    });
  }

  /** Hook-Ereignis: immer sofort ein leerer Erfolg, erst danach an den Kern. Fehler sieht Claude nie. */
  private onHook(req: http.IncomingMessage, res: http.ServerResponse, event: string): void {
    const tabId = headerValue(req, TAB_HEADER);
    const body = readBody(req);
    void body.then((text) => {
      if (text !== null) reply(res, { status: 200 });
    });
    this.hooksForwarded = this.hooksForwarded
      .then(() => body)
      .then((text) => {
        if (text === null || !tabId || !this.receiver) return;
        try {
          this.receiver.claudeHook(tabId, event, parseJson(text));
        } catch (err) {
          console.error(`Lokale Schnittstelle: Hook ${event} konnte nicht verarbeitet werden:`, err);
        }
      });
  }

  /** Meldungen des Starters: Inhalt prüfen (sonst 400) und an den Kern weitergeben. */
  private onStarter(pathname: string, body: unknown): Reply {
    if (!isRecord(body) || !isNonEmptyString(body.tabId)) return { status: 400 };
    const receiver = this.receiver;
    if (!receiver) return { status: 503 };
    const tabId = body.tabId;

    switch (pathname) {
      case '/claude/launch': {
        const launchCase = body.case as LaunchCase;
        const sessionId = optionalString(body.sessionId);
        if (!LAUNCH_CASES.includes(launchCase) || (launchCase === 'withId' && !sessionId)) return { status: 400 };
        const response = receiver.claudeLaunch({ tabId, case: launchCase, sessionId, cwd: optionalString(body.cwd) });
        // Unbekannter Tab: Der Starter startet claude dann unverändert, wie ohne TermHub.
        return response ? { status: 200, json: response } : { status: 404 };
      }
      case '/claude/started':
        if (!Number.isInteger(body.pid) || (body.pid as number) <= 0) return { status: 400 };
        receiver.claudeStarted(tabId, body.pid as number);
        return { status: 200 };
      case '/claude/exit':
        if (!Number.isInteger(body.exitCode)) return { status: 400 };
        receiver.claudeExit(tabId, optionalString(body.sessionId), body.exitCode as number);
        return { status: 200 };
      default:
        return { status: 404 };
    }
  }

  private hasValidToken(req: http.IncomingMessage): boolean {
    const given = headerValue(req, TOKEN_HEADER);
    if (!given) return false;
    const a = Buffer.from(given);
    const b = Buffer.from(this.token);
    return a.length === b.length && timingSafeEqual(a, b);
  }
}

/** Ohne Inhalt: nur Status und `Content-Length: 0`. Mit Inhalt: JSON in UTF-8. */
function reply(res: http.ServerResponse, { status, json }: Reply): void {
  if (json === undefined) {
    res.writeHead(status, { 'Content-Length': 0 });
    res.end();
    return;
  }
  const text = JSON.stringify(json);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
  });
  res.end(text);
}

/**
 * Liest den Inhalt als UTF-8. Zu grosse Inhalte ergeben einen leeren Text; `null` heisst, die Anfrage
 * ist abgebrochen.
 */
function readBody(req: http.IncomingMessage): Promise<string | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size <= MAX_BODY_BYTES) chunks.push(chunk);
    });
    req.on('end', () => resolve(size <= MAX_BODY_BYTES ? Buffer.concat(chunks).toString('utf8') : ''));
    req.on('error', () => resolve(null));
    req.on('close', () => {
      if (!req.complete) resolve(null);
    });
  });
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    return undefined;
  }
}

function headerValue(req: http.IncomingMessage, name: string): string | undefined {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

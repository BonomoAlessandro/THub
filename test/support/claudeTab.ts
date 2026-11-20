// Claude-Tabs für die Kern-Tests: Starter und Hooks über die echte lokale Schnittstelle, Hook-Ereignisse in der Form,
// wie sie Claude Code im Spike geschickt hat (spikes/claude-hooks/samples), und die Hinweise eines Tabs.

import { expect } from 'vitest';
import { OPEN_POINTS_INSTRUCTION } from '../../src/main/workspace/openPoints';
import type { TabSnapshot, ToastSnapshot } from '../../src/shared/types';
import { hookEvent, hookPayload, type ApiResponse, type HookSample } from './apiClient';
import { startWorkspaceWithApi, type TestWorkspace } from './harness';

/** Was THub bei eingeschalteter Einstellung „Offene Punkte“ auf SessionStart antwortet (Ticket 22). */
export const SESSION_START_CONTEXT = {
  hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: OPEN_POINTS_INSTRUCTION },
};

/**
 * Prüft die Antwort auf ein Hook-Ereignis eines bekannten Tabs: immer ein Erfolg ohne Entscheidungsfelder, leer; nur
 * SessionStart bringt bei eingeschalteter Einstellung „Offene Punkte“ die Anweisung als zusätzlichen Kontext mit.
 */
export function expectHookReply(res: ApiResponse, event: string, { openPoints = true } = {}): void {
  expect(res.status).toBe(200);
  if (event === 'SessionStart' && openPoints) expect(JSON.parse(res.body)).toEqual(SESSION_START_CONTEXT);
  else expect(res).toMatchObject({ body: '', headers: { 'content-length': '0' } });
}

/** Ein Claude-Tab, gestartet über den Starter; Claude Code schickt seine Hooks mit dieser Session-Kennung. */
export class ClaudeTab {
  private constructor(
    readonly h: TestWorkspace,
    readonly id: string,
    readonly sessionId: string,
  ) {}

  /** Der Starter meldet den Start von Claude im Tab, danach kommt SessionStart. */
  static async launch(h: TestWorkspace, tabId: string): Promise<ClaudeTab> {
    const res = await h.api.launch({ tabId, case: 'new', cwd: 'C:\\proj' });
    const tab = new ClaudeTab(h, tabId, JSON.parse(res.body).sessionId);
    await tab.send('SessionStart-startup');
    return tab;
  }

  /** Claude Code schickt ein Hook-Ereignis aus den Beispielen des Spikes; liefert die Antwort von THub. */
  async send(sample: HookSample, overrides: Record<string, unknown> = {}): Promise<ApiResponse> {
    const event = hookEvent(sample);
    const payload = hookPayload(sample, { session_id: this.sessionId, cwd: 'C:\\proj', ...overrides });
    const res = await this.h.api.hook(this.id, event, payload);
    expectHookReply(res, event, { openPoints: this.h.snapshot().settings.openPoints });
    return res;
  }

  /** Claude arbeitet an einer Antwort und will einen Befehl ausführen, der eine Berechtigung braucht. */
  async askPermission(): Promise<void> {
    await this.send('UserPromptSubmit');
    await this.send('PreToolUse-Bash');
    await this.send('PermissionRequest-Bash');
  }

  /** Claude bearbeitet einen Prompt und wird fertig. */
  async answer(): Promise<void> {
    await this.send('UserPromptSubmit');
    await this.send('Stop');
  }

  /** Eine Hintergrund-Aufgabe endet: Claude meldet sich mit einem eigenen Prompt und wird wieder fertig. */
  async answerAgain(): Promise<void> {
    await this.send('UserPromptSubmit-task-notification');
    await this.send('Stop');
  }

  /** Der Hinweis dieses Tabs, falls er einen hat. */
  toast(): ToastSnapshot | undefined {
    const own = this.h.snapshot().toasts.filter((t) => t.tabId === this.id);
    expect(own.length).toBeLessThanOrEqual(1);
    return own[0];
  }

  status(): TabSnapshot['status'] {
    const tab = this.h.tabs().find((t) => t.id === this.id);
    if (!tab) throw new Error(`Kein Tab ${this.id}`);
    return tab.status;
  }
}

/** Das Fenster: vorne ein normales Terminal, dahinter zwei Claude-Tabs, in der Leiste in dieser Reihenfolge. */
export interface Scene {
  h: TestWorkspace;
  /** Das normale Terminal; es ist aktiv, das Fenster im Vordergrund. */
  shownId: string;
  a: ClaudeTab;
  b: ClaudeTab;
}

export async function startScene(): Promise<Scene> {
  const h = await startWorkspaceWithApi({ homeDir: 'C:\\Users\\anna' });
  const shownId = h.activeTab()!.id;
  const aId = h.workspace.createTab();
  const bId = h.workspace.createTab();
  h.workspace.activateTab(shownId);
  h.showAllViews();
  // Wie der Renderer beim Laden: Das Fenster hat den Fokus.
  h.workspace.windowForeground(true);
  return { h, shownId, a: await ClaudeTab.launch(h, aId), b: await ClaudeTab.launch(h, bId) };
}

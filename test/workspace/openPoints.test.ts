import * as fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  findOpenPoints,
  MAX_OPEN_POINTS,
  MAX_POINT_LENGTH,
  OPEN_POINTS_INSTRUCTION,
  openPointsContext,
} from '../../src/main/workspace/openPoints';

// Offene Punkte aus Claudes Antworten (Ticket 22): die Erkennung als reine Funktion, mit Antworten, wie Claude sie
// schreibt (deutsch und englisch, Markdown-Varianten, verschachtelte Listen, Code-Blöcke).

/** Mehrzeiliger Text ohne die Einrückung des Quelltexts: Die erste Zeile gibt die Einrückung vor. */
function md(strings: TemplateStringsArray, ...values: unknown[]): string {
  const text = strings.reduce((acc, s, k) => acc + s + (k < values.length ? String(values[k]) : ''), '');
  const raw = text.replace(/^\n/, '');
  const indent = /^ */.exec(raw)?.[0].length ?? 0;
  return raw
    .split('\n')
    .map((line) => line.slice(Math.min(indent, /^ */.exec(line)?.[0].length ?? 0)))
    .join('\n')
    .trimEnd();
}

describe('Anweisung an Claude', () => {
  it('hat genau den Wortlaut der Spezifikation', () => {
    const spec = fs.readFileSync(new URL('../../docs/specs/termhub-v2.md', import.meta.url), 'utf8');
    const wording = /Wortlaut des Kontexts: „([^“]+)“/.exec(spec)?.[1];

    expect(wording).toBeDefined();
    expect(OPEN_POINTS_INSTRUCTION).toBe(wording);
  });

  it('geht als zusätzlicher Kontext von SessionStart an Claude', () => {
    expect(openPointsContext()).toEqual({
      hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: OPEN_POINTS_INSTRUCTION },
    });
  });
});

describe('findOpenPoints', () => {
  describe('Abschnitt „Offene Punkte“ (wie von THub verlangt)', () => {
    it('Markdown-Überschrift mit Aufzählung: die Punkte darunter, ohne Aufzählungszeichen', () => {
      const answer = md`
        Ich habe die Anmeldung auf OAuth umgestellt und die Tests angepasst. Alle 42 Tests laufen durch.

        ## Offene Punkte

        - Soll der alte Login mit Passwort bis Ende Jahr parallel weiterlaufen?
        - Die Client-ID für die Produktion fehlt noch in \`config/prod.json\`.
        - Bitte prüfe, ob die Weiterleitungs-URL bei Azure eingetragen ist.
      `;

      expect(findOpenPoints(answer)).toEqual([
        'Soll der alte Login mit Passwort bis Ende Jahr parallel weiterlaufen?',
        'Die Client-ID für die Produktion fehlt noch in config/prod.json.',
        'Bitte prüfe, ob die Weiterleitungs-URL bei Azure eingetragen ist.',
      ]);
    });

    it.each([
      ['### Offene Punkte', 'Überschrift dritter Ebene'],
      ['# Offene Punkte #', 'geschlossene Überschrift'],
      ['**Offene Punkte**', 'fette Zeile'],
      ['**Offene Punkte:**', 'fette Zeile mit Doppelpunkt darin'],
      ['**Offene Punkte**:', 'fette Zeile mit Doppelpunkt dahinter'],
      ['__Offene Punkte__', 'fett mit Unterstrichen'],
      ['Offene Punkte:', 'Zeile mit Doppelpunkt'],
      ['OFFENE PUNKTE:', 'gross geschrieben'],
      ['## ❓ Offene Punkte', 'mit Emoji davor'],
      ['## 3. Offene Punkte', 'nummeriert'],
      ['**Offene Punkte (2)**', 'mit Anzahl'],
    ])('%s (%s)', (heading) => {
      const answer = `Erledigt.\n\n${heading}\n- Erster Punkt\n- Zweiter Punkt`;

      expect(findOpenPoints(answer)).toEqual(['Erster Punkt', 'Zweiter Punkt']);
    });

    it('Setext-Überschrift (unterstrichen)', () => {
      expect(findOpenPoints('Erledigt.\n\nOffene Punkte\n-------------\n\n- Erster Punkt')).toEqual(['Erster Punkt']);
      expect(findOpenPoints('Erledigt.\n\nOffene Fragen\n=============\n- Erster Punkt')).toEqual(['Erster Punkt']);
    });

    it.each([
      'Offene Punkte',
      'Offene Fragen',
      'Noch offen',
      'Noch offene Punkte',
      'Noch offene Fragen',
      'Fragen an dich',
      'Zu klären',
      'Open points',
      'Open questions',
      'Open Questions',
    ])('Überschrift „%s“', (title) => {
      expect(findOpenPoints(`Fertig.\n\n## ${title}\n\n- Erster Punkt`)).toEqual(['Erster Punkt']);
    });

    it.each([
      ['Zusammenfassung', 'eine andere Überschrift'],
      ['Offene Punkteliste', 'kein ganzes Wort'],
      ['Nächste Schritte', 'eine andere Überschrift'],
      ['Open issues', 'nicht in der Liste'],
    ])('keine Überschrift offener Punkte: „%s“ (%s)', (title) => {
      expect(findOpenPoints(`Fertig.\n\n## ${title}\n\n- Erster Punkt\n- Zweiter Punkt`)).toEqual([]);
    });

    it('nummerierte Liste, Sternchen, Pluszeichen und Kästchen', () => {
      expect(findOpenPoints('## Offene Fragen\n1. Eins?\n2) Zwei?\n10. Zehn?')).toEqual(['Eins?', 'Zwei?', 'Zehn?']);
      expect(findOpenPoints('## Offene Fragen\n* Stern\n+ Plus\n• Punkt')).toEqual(['Stern', 'Plus', 'Punkt']);
      expect(findOpenPoints('## Offene Punkte\n- [ ] Migration prüfen\n- [x] Backup')).toEqual(['Migration prüfen', 'Backup']);
    });

    it('Leerzeilen zwischen den Punkten (lockere Liste) gehören noch dazu', () => {
      const answer = md`
        **Offene Punkte**

        - Erster Punkt

        - Zweiter Punkt
      `;

      expect(findOpenPoints(answer)).toEqual(['Erster Punkt', 'Zweiter Punkt']);
    });

    it('ein Punkt über mehrere Zeilen wird zu einer Zeile', () => {
      const answer = md`
        ## Offene Punkte
        - Soll ich die alte API-Version noch unterstützen? Das würde
          bedeuten, dass wir beide Formate parsen müssen.
        - Zweiter Punkt,
        ohne Einrückung fortgesetzt.
      `;

      expect(findOpenPoints(answer)).toEqual([
        'Soll ich die alte API-Version noch unterstützen? Das würde bedeuten, dass wir beide Formate parsen müssen.',
        'Zweiter Punkt, ohne Einrückung fortgesetzt.',
      ]);
    });

    it('verschachtelte Liste: Unterpunkte gehören zu ihrem Punkt und zählen nicht einzeln', () => {
      const answer = md`
        Die Datenbank-Schicht ist vorbereitet.

        ### Offene Fragen
        1. Welche Datenbank sollen wir verwenden?
           - PostgreSQL: robuster, aber mehr Betrieb
           - SQLite: einfacher, reicht für den Anfang
             und lässt sich später migrieren
        2. Soll das Logging in Dateien oder nach stdout gehen?
           Für Docker wäre stdout üblich.
      `;

      expect(findOpenPoints(answer)).toEqual([
        'Welche Datenbank sollen wir verwenden?',
        'Soll das Logging in Dateien oder nach stdout gehen? Für Docker wäre stdout üblich.',
      ]);
    });

    it('eine eingerückte Liste: ihre oberste Ebene zählt', () => {
      expect(findOpenPoints('Offene Punkte:\n  - Eins\n    - Unterpunkt\n  - Zwei')).toEqual(['Eins', 'Zwei']);
    });

    it('ein eigener Absatz unter einem Punkt zählt nicht dazu', () => {
      const answer = md`
        ## Offene Punkte
        - Soll ich den Cache einbauen?

          Er würde die Ladezeit etwa halbieren.
        - Zweiter Punkt
      `;

      expect(findOpenPoints(answer)).toEqual(['Soll ich den Cache einbauen?', 'Zweiter Punkt']);
    });

    it('die Aufzählung endet am nächsten Absatz, an einer Überschrift oder einer Trennlinie', () => {
      expect(findOpenPoints('## Offene Punkte\n- Eins\n- Zwei\n\nSag Bescheid, wenn du Fragen hast.')).toEqual(['Eins', 'Zwei']);
      expect(findOpenPoints('## Offene Punkte\n- Eins\n## Zusammenfassung\n- Zwei')).toEqual(['Eins']);
      expect(findOpenPoints('**Offene Punkte**\n- Eins\n**Details**\n- Zwei')).toEqual(['Eins']);
      expect(findOpenPoints('## Offene Punkte\n- Eins\n\n---\n\n- Zwei')).toEqual(['Eins']);
    });

    it('mehrere Abschnitte zählen zusammen, in der Reihenfolge der Antwort', () => {
      const answer = md`
        ## Offene Fragen
        - Frage eins?

        ## Zu klären
        - Punkt zwei
      `;

      expect(findOpenPoints(answer)).toEqual(['Frage eins?', 'Punkt zwei']);
    });

    it('Hervorhebung, Links und Code im Text verschwinden, ihr Inhalt bleibt', () => {
      const answer = md`
        ## Offene Punkte
        - **Datenbank:** PostgreSQL oder *SQLite*?
        - Siehe [Anleitung](https://example.com/setup) für \`__init__.py\`.
        - __Wichtig__: Backup vorher anlegen
      `;

      expect(findOpenPoints(answer)).toEqual([
        'Datenbank: PostgreSQL oder SQLite?',
        'Siehe Anleitung für __init__.py.',
        'Wichtig: Backup vorher anlegen',
      ]);
    });

    it('ein sehr langer Punkt wird gekürzt; mehr als 20 Punkte werden nicht übernommen', () => {
      const long = 'x'.repeat(MAX_POINT_LENGTH + 50);
      const many = Array.from({ length: MAX_OPEN_POINTS + 5 }, (_, k) => `- Punkt ${k + 1}`).join('\n');

      const [point] = findOpenPoints(`## Offene Punkte\n- ${long}`);
      expect(point).toHaveLength(MAX_POINT_LENGTH);
      expect(point.endsWith('…')).toBe(true);
      expect(findOpenPoints(`## Offene Punkte\n${many}`)).toHaveLength(MAX_OPEN_POINTS);
    });

    it('englische Antwort mit „Open questions:“', () => {
      const answer = md`
        I refactored the parser into three modules and added unit tests for each of them.

        Open questions:
        - Should the legacy \`v1\` format still be accepted, or can we drop it?
        - Do you want me to publish the package to the internal registry?
      `;

      expect(findOpenPoints(answer)).toEqual([
        'Should the legacy v1 format still be accepted, or can we drop it?',
        'Do you want me to publish the package to the internal registry?',
      ]);
    });

    it('Windows-Zeilenenden', () => {
      expect(findOpenPoints('Fertig.\r\n\r\n## Offene Punkte\r\n- Eins\r\n- Zwei\r\n')).toEqual(['Eins', 'Zwei']);
    });
  });

  describe('Code-Blöcke zählen nie', () => {
    it('Überschrift und Aufzählung in einem Code-Block sind keine offenen Punkte', () => {
      const answer = md`
        Hier die neue Vorlage für das README:

        \`\`\`markdown
        ## Offene Punkte
        - Platzhalter eins
        - Platzhalter zwei
        \`\`\`

        Die Vorlage liegt jetzt unter docs/vorlage.md.
      `;

      expect(findOpenPoints(answer)).toEqual([]);
    });

    it('ein Code-Block zwischen Überschrift und Liste beendet den Abschnitt', () => {
      const answer = md`
        ## Offene Punkte
        ~~~
        - kein Punkt
        ~~~
        - auch kein Punkt mehr
      `;

      expect(findOpenPoints(answer)).toEqual([]);
    });

    it('ein eingerückter Code-Block unter einem Punkt gehört zum Punkt; die Punkte danach zählen', () => {
      const answer = md`
        ## Offene Punkte
        - Soll der Befehl so in die CI?
          \`\`\`yaml
          - run: npm test
          - run: npm run build
          \`\`\`
        - Wer pflegt die Secrets?
      `;

      expect(findOpenPoints(answer)).toEqual(['Soll der Befehl so in die CI?', 'Wer pflegt die Secrets?']);
    });

    it('ein Fragezeichen am Ende eines Code-Blocks ist keine Frage', () => {
      const answer = md`
        Der reguläre Ausdruck sieht jetzt so aus:

        \`\`\`ts
        const optional = /colou?r?/;
        // Warum nicht einfacher?
        \`\`\`
      `;

      expect(findOpenPoints(answer)).toEqual([]);
    });

    it('ein Zaun schliesst nur mit denselben Zeichen, mindestens so vielen', () => {
      const answer = md`
        \`\`\`\`md
        \`\`\`
        ## Offene Punkte
        - in Code
        \`\`\`
        \`\`\`\`

        ## Offene Punkte
        - echter Punkt
      `;

      expect(findOpenPoints(answer)).toEqual(['echter Punkt']);
    });

    it('ein nicht geschlossener Code-Block reicht bis zum Ende', () => {
      expect(findOpenPoints('Fertig.\n\n```\n## Offene Punkte\n- in Code\nWarum?')).toEqual([]);
    });
  });

  describe('ohne Überschrift: Frage am Ende des letzten Absatzes', () => {
    it('die Frage am Ende ist ein offener Punkt, ohne die Sätze davor', () => {
      const answer = md`
        Ich habe den Fehler gefunden: Die Zeitzone wurde beim Parsen ignoriert.

        Der Fix steckt in \`src/date.ts\`, die Tests sind ergänzt. Soll ich auch die alten Einträge in der Datenbank korrigieren?
      `;

      expect(findOpenPoints(answer)).toEqual(['Soll ich auch die alten Einträge in der Datenbank korrigieren?']);
    });

    it('mehrere Fragen direkt hintereinander am Ende bilden einen Punkt', () => {
      expect(findOpenPoints('Alles umgebaut. Soll ich die Tests anpassen? Oder lieber zuerst die Doku?')).toEqual([
        'Soll ich die Tests anpassen? Oder lieber zuerst die Doku?',
      ]);
    });

    it('Abkürzungen beenden keinen Satz', () => {
      expect(findOpenPoints('Erledigt. Soll ich z. B. die Logs bzw. Caches auch leeren?')).toEqual([
        'Soll ich z. B. die Logs bzw. Caches auch leeren?',
      ]);
      expect(findOpenPoints('Done. Should I also bump the version, e.g. to 2.1?')).toEqual([
        'Should I also bump the version, e.g. to 2.1?',
      ]);
    });

    it('ein Absatz über mehrere Zeilen', () => {
      const answer = 'Die Migration ist fertig.\nSoll ich sie gleich auf dem\nTestsystem ausführen?';

      expect(findOpenPoints(answer)).toEqual(['Soll ich sie gleich auf dem Testsystem ausführen?']);
    });

    it('nach dem Fragezeichen dürfen Hervorhebung, Anführungszeichen, Klammern oder ein Emoji stehen', () => {
      expect(findOpenPoints('Fertig. **Soll ich committen?**')).toEqual(['Soll ich committen?']);
      expect(findOpenPoints('Fertig. Passt das so? 🙂')).toEqual(['Passt das so? 🙂']);
      expect(findOpenPoints('Fertig. (Oder brauchst du noch etwas?)')).toEqual(['(Oder brauchst du noch etwas?)']);
    });

    it('eine fette Frage als ganze Zeile', () => {
      expect(findOpenPoints('Alles erledigt.\n\n**Soll ich die Änderungen committen?**')).toEqual([
        'Soll ich die Änderungen committen?',
      ]);
    });

    it('endet der letzte Absatz mit einer Aufzählung, zählt nur ihr letzter Punkt', () => {
      const answer = md`
        Ich sehe zwei Wege:
        - Wir cachen die Antworten im Speicher.
        - Wir nutzen Redis. Welche Variante bevorzugst du?
      `;

      expect(findOpenPoints(answer)).toEqual(['Welche Variante bevorzugst du?']);
    });

    it('eine Überschrift direkt über der Frage gehört nicht dazu', () => {
      expect(findOpenPoints('## Nächster Schritt\nSoll ich deployen?')).toEqual(['Soll ich deployen?']);
      expect(findOpenPoints('Fertig.\n\n**Offene Punkte**\nSoll ich deployen?')).toEqual(['Soll ich deployen?']);
    });

    it('ein Zitat am Ende', () => {
      expect(findOpenPoints('Fertig.\n\n> Soll ich das so übernehmen?')).toEqual(['Soll ich das so übernehmen?']);
    });

    it('englisch', () => {
      const answer = md`
        I've added the retry logic with exponential backoff (max 5 attempts).

        Would you like me to make the retry count configurable via an environment variable?
      `;

      expect(findOpenPoints(answer)).toEqual([
        'Would you like me to make the retry count configurable via an environment variable?',
      ]);
    });

    it('keine Frage am Ende: keine Punkte', () => {
      expect(findOpenPoints('Ich habe die Datei angepasst. Sag Bescheid, wenn du Fragen hast!')).toEqual([]);
      expect(findOpenPoints('Warum war das kaputt? Die Zeitzone fehlte. Jetzt ist es behoben.')).toEqual([]);
    });

    it('eine Frage weiter oben, aber nicht am Ende des letzten Absatzes: keine Punkte', () => {
      const answer = md`
        Soll ich auch die Tests anpassen?

        Ich habe das schon mal vorbereitet.
      `;

      expect(findOpenPoints(answer)).toEqual([]);
    });

    it('eine Überschrift als letzte Zeile ist kein Absatz', () => {
      expect(findOpenPoints('Fertig.\n\n## Was nun?')).toEqual([]);
    });

    it('unter der Überschrift steht eine Liste ohne Frage am Ende: nur die Liste zählt', () => {
      expect(findOpenPoints('## Offene Punkte\n- Eins\n\nAlles klar?')).toEqual(['Eins']);
    });
  });

  it('leere oder fehlende Antwort: keine Punkte', () => {
    expect(findOpenPoints(undefined)).toEqual([]);
    expect(findOpenPoints('')).toEqual([]);
    expect(findOpenPoints('   \n\n  ')).toEqual([]);
    expect(findOpenPoints('<redigiert>')).toEqual([]);
  });
});

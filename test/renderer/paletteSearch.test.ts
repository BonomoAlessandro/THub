import { describe, expect, it } from 'vitest';
import { fuzzyScore, itemScore, searchGroups, type SearchGroup } from '../../src/renderer/palette/search';

// Unscharfe Suche der Befehlspalette, als reine Funktion.

interface Item {
  label: string;
  detail?: string;
}

const labels = (groups: SearchGroup<Item>[]) => groups.map((g) => [g.title, g.items.map((i) => i.label)]);

describe('Unscharfe Suche', () => {
  it.each([
    ['termhb', 'termhub'],
    ['api', 'api-gateway'],
    ['neu term', 'Neues Terminal'],
    ['NEU TERM', 'Neues Terminal'],
    ['einst', 'Einstellungen'],
    ['tk', 'Tastenkürzel anzeigen'],
  ])('„%s“ findet „%s“', (query, text) => {
    expect(fuzzyScore(query, text)).not.toBeNull();
  });

  it.each([
    ['xyz', 'termhub'],
    ['buhmret', 'termhub'],
    ['apis', 'api-gateway'],
  ])('„%s“ findet „%s“ nicht', (query, text) => {
    expect(fuzzyScore(query, text)).toBeNull();
  });

  it('eine leere Suche passt zu allem', () => {
    expect(fuzzyScore('', 'termhub')).toBe(0);
    expect(fuzzyScore('   ', 'termhub')).toBe(0);
  });

  it('zusammenhängende Treffer zählen mehr als verstreute', () => {
    expect(fuzzyScore('api', 'rapid')!).toBeGreaterThan(fuzzyScore('api', 'rampion')!);
    expect(fuzzyScore('term', 'Neues Terminal')!).toBeGreaterThan(fuzzyScore('term', 'the remote machine')!);
  });

  it('Treffer an Wortanfängen zählen mehr', () => {
    expect(fuzzyScore('nt', 'Neues Terminal')!).toBeGreaterThan(fuzzyScore('nt', 'Konto')!);
    expect(fuzzyScore('st', 'Standardordner ändern')!).toBeGreaterThan(fuzzyScore('st', 'Liste')!);
  });

  it('der beste Fundort zählt, nicht der erste', () => {
    // Gierig ab dem ersten „a“ wären die Treffer verstreut; ab „api“ liegen sie zusammen am Wortanfang.
    expect(fuzzyScore('api', 'my-app-api')!).toBeGreaterThan(fuzzyScore('api', 'my-app-xpi')!);
  });

  it('bei sonst gleichem Treffer geht der kürzere Text vor', () => {
    expect(fuzzyScore('api', 'api')!).toBeGreaterThan(fuzzyScore('api', 'api-gateway')!);
  });

  it('der Ordner eines Tabs wird auch gefunden, zählt aber weniger als der Name', () => {
    const byFolder = { label: 'backend', detail: 'C:\\dev\\api-gateway' };
    const byName = { label: 'api-gateway', detail: 'C:\\dev\\backend' };
    expect(itemScore('api', byFolder)).not.toBeNull();
    expect(itemScore('api', byName)!).toBeGreaterThan(itemScore('api', byFolder)!);
    // Name und Ordner zusammen: „web src“ findet den Tab „web“ im Ordner „C:\web\src“.
    expect(itemScore('web src', { label: 'web', detail: 'C:\\web\\src' })).not.toBeNull();
  });
});

describe('Gruppen der Palette durchsuchen', () => {
  const groups: SearchGroup<Item>[] = [
    {
      title: 'Tabs',
      items: [
        { label: 'termhub', detail: 'C:\\dev\\termhub' },
        { label: 'api-gateway', detail: 'C:\\dev\\api-gateway' },
        { label: 'Einstellungen', detail: 'C:\\docs\\einstellungen' },
      ],
    },
    {
      title: 'Befehle',
      items: [{ label: 'Neues Terminal' }, { label: 'Einstellungen' }, { label: 'Tastenkürzel anzeigen' }],
    },
  ];

  it('ohne Suche bleibt alles in seiner Reihenfolge', () => {
    expect(labels(searchGroups('', groups))).toEqual([
      ['Tabs', ['termhub', 'api-gateway', 'Einstellungen']],
      ['Befehle', ['Neues Terminal', 'Einstellungen', 'Tastenkürzel anzeigen']],
    ]);
  });

  it('mit Suche bleiben nur passende Einträge, leere Gruppen fallen weg', () => {
    expect(labels(searchGroups('termhb', groups))).toEqual([['Tabs', ['termhub']]]);
    expect(labels(searchGroups('neu term', groups))).toEqual([['Befehle', ['Neues Terminal']]]);
    expect(labels(searchGroups('qqq', groups))).toEqual([]);
  });

  it('bei gleich gutem Treffer stehen Tabs vor Befehlen', () => {
    expect(labels(searchGroups('einstellungen', groups))).toEqual([
      ['Tabs', ['Einstellungen']],
      ['Befehle', ['Einstellungen']],
    ]);
  });

  it('ein besserer Treffer bei den Befehlen steht oben, damit Enter ihn ausführt', () => {
    const withWeakTab: SearchGroup<Item>[] = [
      { title: 'Tabs', items: [{ label: 'nodejs-euler-stuff', detail: 'C:\\x' }] },
      { title: 'Befehle', items: [{ label: 'Neues Terminal' }] },
    ];
    expect(labels(searchGroups('neu', withWeakTab))).toEqual([
      ['Befehle', ['Neues Terminal']],
      ['Tabs', ['nodejs-euler-stuff']],
    ]);
  });

  it('innerhalb einer Gruppe steht der beste Treffer zuerst', () => {
    const tabs: SearchGroup<Item>[] = [
      {
        title: 'Tabs',
        items: [
          { label: 'happiness', detail: 'C:\\x' },
          { label: 'api', detail: 'C:\\y' },
        ],
      },
    ];
    expect(labels(searchGroups('api', tabs))).toEqual([['Tabs', ['api', 'happiness']]]);
  });
});

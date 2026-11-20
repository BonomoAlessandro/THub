// OSC-8-Links (etwa die URLs, die Claude ausgibt) ohne gestrichelte Unterstreichung.
//
// xterm.js 6 unterstreicht jede Zelle mit Link von sich aus gestrichelt: Der Getter `underlineStyle` der erweiterten
// Zellattribute (`ExtendedAttrs`) liefert für eine Zelle mit Link-Kennung (`urlId`) immer „gestrichelt“ (5), egal, was das
// Programm verlangt hat. Der DOM-Renderer macht daraus die Klasse `xterm-underline-5`, dieselbe wie für ein ausdrücklich
// verlangtes SGR 4:5. Per CSS lassen sich die beiden deshalb nicht trennen, und eine Option dafür hat xterm.js nicht.
//
// Darum wird dieser eine Getter ersetzt: Für Zellen mit Link liefert er den Stil, den das Programm selbst gesetzt hat
// (meist keinen; mit SGR 4:5 weiterhin gestrichelt). Die Link-Kennung bleibt, damit xterm.js den Link weiter erkennt:
// Hand-Zeiger und durchgezogene Unterstreichung beim Überfahren zeichnet es selbst, Ctrl+Klick öffnet ihn.

import type { Terminal } from '@xterm/xterm';

/** Die erweiterten Zellattribute von xterm.js, soweit sie hier gebraucht werden. */
interface ExtendedAttrs {
  urlId: number;
}

/** Bereits angepasste Prototypen; alle Terminals desselben xterm.js teilen sich einen. */
const adjusted = new WeakSet<object>();

/**
 * Nimmt OSC-8-Links die gestrichelte Unterstreichung, die xterm.js von sich aus zeichnet. Wirkt für alle Terminals
 * desselben xterm.js; ein zweiter Aufruf ändert nichts mehr.
 * @returns `false`, wenn xterm.js anders gebaut ist als erwartet (dann bleibt alles, wie es war)
 */
export function removeLinkUnderline(term: Terminal): boolean {
  // Die leere Zelle der öffentlichen API trägt dieselben erweiterten Attribute wie jede Zelle im Puffer.
  const extended: unknown = (term.buffer.active.getNullCell() as { extended?: unknown }).extended;
  const proto: object | null = typeof extended === 'object' && extended ? Object.getPrototypeOf(extended) : null;
  if (!proto) return false;
  if (adjusted.has(proto)) return true;

  const style = Object.getOwnPropertyDescriptor(proto, 'underlineStyle');
  const urlId = Object.getOwnPropertyDescriptor(proto, 'urlId');
  if (!style?.get || !style.set || !urlId?.get || !urlId.set) return false;

  const ownStyle = style.get;
  Object.defineProperty(proto, 'underlineStyle', {
    ...style,
    get(this: ExtendedAttrs): number {
      const id = this.urlId;
      if (!id) return ownStyle.call(this);
      // Ohne Link-Kennung liefert der Getter von xterm.js den Stil, den das Programm gesetzt hat. Die Kennung kommt
      // sofort zurück; dazwischen läuft nichts anderes.
      this.urlId = 0;
      try {
        return ownStyle.call(this);
      } finally {
        this.urlId = id;
      }
    },
  });
  adjusted.add(proto);
  return true;
}

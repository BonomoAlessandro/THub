// Symbole aus dem Prototyp (Strichzeichnungen im 24er-Raster).

export function PlusIcon() {
  return (
    <svg className="i" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function ChevronIcon() {
  return (
    <svg className="i" viewBox="0 0 24 24" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function GearIcon() {
  return (
    <svg className="i" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function FolderIcon() {
  return (
    <svg className="i" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
    </svg>
  );
}

export function FolderPlusIcon() {
  return (
    <svg className="i" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 10v6M9 13h6" />
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
    </svg>
  );
}

export function FolderOpenIcon() {
  return (
    <svg className="i" viewBox="0 0 24 24" aria-hidden="true">
      <path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

/** Lupe im Suchfeld der Befehlspalette. */
export function SearchIcon() {
  return (
    <svg className="i" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

export function PencilIcon() {
  return (
    <svg className="i" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M21.17 6.81a1 1 0 0 0-3.99-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5z" />
    </svg>
  );
}

/** Uhr mit Pfeil zurück, für „Zuletzt geschlossen“. */
export function HistoryIcon() {
  return (
    <svg className="i" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l4 2" />
    </svg>
  );
}

/** Kasten mit ×, für „Andere Tabs schliessen“. */
export function CloseOthersIcon() {
  return (
    <svg className="i" viewBox="0 0 24 24" aria-hidden="true">
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="m15 9-6 6M9 9l6 6" />
    </svg>
  );
}

/** Schieberegler, für „Einstellungen“ in der Befehlspalette. */
export function SlidersIcon() {
  return (
    <svg className="i" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 7h-9M14 17H5" />
      <circle cx="17" cy="17" r="3" />
      <circle cx="7" cy="7" r="3" />
    </svg>
  );
}

/** Tastatur, für „Tastenkürzel anzeigen“. */
export function KeyboardIcon() {
  return (
    <svg className="i" viewBox="0 0 24 24" aria-hidden="true">
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M7 16h10" />
    </svg>
  );
}

/** Eine Shell im Pfeil-Menü. */
export function TerminalIcon() {
  return (
    <svg className="i" viewBox="0 0 24 24" aria-hidden="true">
      <path d="m4 17 6-6-6-6" />
      <path d="M12 19h8" />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg className="i" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

/** „Duplizieren“ im Rechtsklick-Menü. */
export function DuplicateIcon() {
  return (
    <svg className="i" viewBox="0 0 24 24" aria-hidden="true">
      <rect width="14" height="14" x="8" y="8" rx="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
      <path d="M15 12v6M12 15h6" />
    </svg>
  );
}

/** „Pfad kopieren“ im Rechtsklick-Menü. */
export function CopyIcon() {
  return (
    <svg className="i" viewBox="0 0 24 24" aria-hidden="true">
      <rect width="14" height="14" x="8" y="8" rx="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </svg>
  );
}

/** Pfeil nach rechts, etwa in „Zum Tab wechseln →“ auf den Hinweisen. */
export function ArrowRightIcon() {
  return (
    <svg className="i" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

/** Aufzählung: Symbol des Hinweises mit offenen Punkten aus Claudes Antwort. */
export function ListIcon() {
  return (
    <svg className="ls" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 6h.01M4 12h.01M4 18h.01" />
      <path d="M9 6h11M9 12h11M9 18h11" />
    </svg>
  );
}

/** Typ-Symbol eines normalen Terminals: `>_`. */
export function TerminalTypeIcon() {
  return (
    <svg className="ty" viewBox="0 0 24 24" aria-hidden="true">
      <path d="m5 16 5-4-5-4" />
      <path d="M12 17h7" />
    </svg>
  );
}

/** Pause-Symbol für „pausiert“: zwei gefüllte, abgerundete Balken im 10er-Raster. */
export function PauseIcon() {
  return (
    <svg className="pause" viewBox="0 0 10 10" aria-hidden="true">
      <rect x="1.5" y="1" width="2.6" height="8" rx="0.8" />
      <rect x="5.9" y="1" width="2.6" height="8" rx="0.8" />
    </svg>
  );
}

/** Claude-Stern: ruhend als Typ-Symbol eines Claude-Tabs, rotierend und pulsierend für „arbeitet“. */
export function SparkIcon() {
  return (
    <svg className="spark" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6 5.6 18.4" />
    </svg>
  );
}

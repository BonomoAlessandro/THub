// Symbole aus dem Prototyp (Strichzeichnungen im 24er-Raster).

export function PlusIcon() {
  return (
    <svg className="i" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
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

/** Typ-Symbol eines normalen Terminals: `>_`. */
export function TerminalTypeIcon() {
  return (
    <svg className="ty" viewBox="0 0 24 24" aria-hidden="true">
      <path d="m5 16 5-4-5-4" />
      <path d="M12 17h7" />
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

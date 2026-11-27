import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { TabSnapshot, UsageSnapshot } from '../../shared/types';
import { SparkIcon } from '../icons';
import { Tooltip } from '../tabs/Tooltip';
import {
  LEVELS,
  SEGMENTS,
  fitLevel,
  usageBarItems,
  usageTooltip,
  type UsageBarItem,
  type UsageBarLevel,
} from './usageItems';

/** So lange liegt die Maus auf dem Balken, bis sein Tooltip erscheint; wie an den Tabs. */
const TOOLTIP_DELAY_MS = 550;

interface UsageBarProps {
  usage: UsageSnapshot;
  /** Der angezeigte Tab, ein Claude-Tab: Modell und Kosten kommen von ihm. */
  tab: TabSnapshot;
  /** Alle Tabs, für den Namen des Tabs, aus dem der Stand der Limits kommt. */
  tabs: TabSnapshot[];
}

/**
 * Verbrauchsbalken (Ticket 38): eine Zeile ganz unten im Fenster, nur in Claude-Tabs. Von links das Symbol des
 * Claude-Tabs mit dem Modell, die Session mit Mini-Balken und Reset, die Kosten zum Listenpreis der API und die Woche
 * mit Mini-Balken und Reset. Wird das Fenster schmal, entfallen zuerst die Resets, dann die Mini-Balken, zuletzt die
 * Kosten; die Zeile bricht nie um. Uhrzeiten und das Gedämpfte nach einem Reset folgen der Uhr, mindestens einmal pro
 * Minute; sonst ändert sich die Zeile nur mit neuen Meldungen.
 */
export function UsageBar({ usage, tab, tabs }: UsageBarProps) {
  const now = useMinuteClock();
  const tabUsage = usage.tabs[tab.id];
  const rows = LEVELS.map((_, level) => usageBarItems(tabUsage, usage.limits, now, level as UsageBarLevel));

  // Die passende Stufe: Jede Stufe steht unsichtbar im Messbereich; gewählt wird die erste, die in die Zeile passt.
  const barRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [level, setLevel] = useState<UsageBarLevel>(0);
  // Eine neue Breite zeichnet neu, und damit wird neu gemessen.
  const [, setResizes] = useState(0);
  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const observer = new ResizeObserver(() => setResizes((n) => n + 1));
    observer.observe(bar);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    const bar = barRef.current;
    const measure = measureRef.current;
    if (!bar || !measure) return;
    const style = getComputedStyle(bar);
    const available = bar.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const widths = [...measure.children].map((row) => (row as HTMLElement).offsetWidth);
    setLevel(fitLevel(widths, available));
  });

  const tooltip = useBarTooltip();
  const fromTab = usage.limits ? tabs.find((t) => t.id === usage.limits!.tabId)?.name : undefined;

  return (
    <footer
      ref={barRef}
      className="usage-bar"
      data-level={level}
      onMouseEnter={(e) => tooltip.schedule(e.currentTarget)}
      onMouseLeave={tooltip.hide}
    >
      <UsageRow items={rows[level]} />
      <div ref={measureRef} className="usage-measure" aria-hidden="true">
        {rows.map((items, i) => (
          <UsageRow key={i} items={items} />
        ))}
      </div>
      {tooltip.anchor && (
        <Tooltip anchor={tooltip.anchor} placement="above">
          <UsageTooltipContent tooltip={usageTooltip(tabUsage, usage.limits, now, fromTab)} />
        </Tooltip>
      )}
    </footer>
  );
}

function UsageRow({ items }: { items: UsageBarItem[] }) {
  return (
    <div className="usage-row">
      {items.map((item, i) => (
        <Fragment key={i}>
          {i > 0 && item.kind !== 'note' && <span className="usage-sep" />}
          <UsageItem item={item} />
        </Fragment>
      ))}
    </div>
  );
}

function UsageItem({ item }: { item: UsageBarItem }) {
  switch (item.kind) {
    case 'model':
      return (
        <span className="usage-item usage-model">
          <span className="usage-star">
            <SparkIcon />
          </span>
          {item.name && <span className="usage-value">{item.name}</span>}
        </span>
      );
    case 'limit':
      return (
        <span className="usage-item" data-warn={item.warn || undefined} data-expired={item.expired || undefined}>
          <span className="usage-label">{item.label}</span>
          {item.segments !== undefined && <MiniBar filled={item.segments} />}
          <span className="usage-value usage-pct">{item.percent}</span>
          {item.reset && <span className="usage-reset">{item.reset}</span>}
        </span>
      );
    case 'cost':
      return (
        <span className="usage-item">
          <span className="usage-label">API</span>
          <span className="usage-value">{item.value}</span>
        </span>
      );
    case 'note':
      return <span className="usage-item usage-note">{item.text}</span>;
  }
}

/** Mini-Balken mit 8 Segmenten; die gefüllten in der Farbe des Werts. */
function MiniBar({ filled }: { filled: number }) {
  return (
    <span className="usage-mini" aria-hidden="true">
      {Array.from({ length: SEGMENTS }, (_, i) => (
        <span key={i} className={i < filled ? 'on' : undefined} />
      ))}
    </span>
  );
}

function UsageTooltipContent({ tooltip }: { tooltip: ReturnType<typeof usageTooltip> }) {
  return (
    <>
      <b>Verbrauch</b>
      {tooltip.rows.length > 0 && (
        <dl>
          {tooltip.rows.map((row) => (
            <Fragment key={row.label}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </Fragment>
          ))}
        </dl>
      )}
      <p className="tip-note">{tooltip.note}</p>
    </>
  );
}

/** Die Uhr des Balkens: jetzt, neu zu Beginn jeder Minute. */
function useMinuteClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const current = Date.now();
      setNow(current);
      // Kurz nach dem Minutenwechsel, damit „15:40“ und der Reset um 15:40 zusammen kommen.
      timer = setTimeout(tick, 60_000 - (current % 60_000) + 50);
    };
    timer = setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50);
    return () => clearTimeout(timer);
  }, []);
  return now;
}

/** Tooltip über dem Balken, nach einer kurzen Verzögerung. */
function useBarTooltip() {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return {
    anchor,
    schedule(el: HTMLElement) {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        if (el.isConnected) setAnchor(rowRect(el));
      }, TOOLTIP_DELAY_MS);
    },
    hide() {
      window.clearTimeout(timer.current);
      setAnchor(null);
    },
  };
}

/** Lage der sichtbaren Zeile im Balken: Der Tooltip steht links an ihrem Anfang. */
function rowRect(bar: HTMLElement): DOMRect {
  const row = bar.querySelector('.usage-row');
  return (row ?? bar).getBoundingClientRect();
}

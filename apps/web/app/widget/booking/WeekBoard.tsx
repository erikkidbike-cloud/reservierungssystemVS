'use client';

// The week grid: days across, hours down, occupied time in blue, closing hours
// hatched, today tinted — and click-or-drag to pick a slot.
//
// This is the half of the old embeddable widget the day-based /book wizard
// never replaced. Seeing one day at a time answers "is Saturday free?" only by
// clicking through seven days; a week grid answers it at a glance, which is
// what somebody planning a birthday actually wants to know.
//
// Selection navigates rather than holding state: picking a range pushes
// ?date=&from=&to= onto the URL, the server re-renders with that day's blocks,
// and the request form below opens already filled in. That keeps one source of
// truth for what is free (the server's read of public_availability) instead of
// a client-side copy that can drift, and it makes every selection a shareable,
// reloadable link.

import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState } from 'react';

export interface WeekBlock {
  startsAt: string;
  endsAt: string;
  kind: 'busy' | 'hold' | 'project';
  publicTitle?: string | null;
  color?: string | null;
}

export interface WeekBoardProps {
  /** Monday of the shown week, "YYYY-MM-DD". */
  weekStart: string;
  blocks: WeekBlock[];
  /** The location's bookable window, as hour offsets from midnight. */
  gridMinHour: number;
  gridMaxEndHour: number;
  closingHour: number | null;
  minDurationMinutes: number;
  lang: 'de' | 'en';
  /** Preserved when navigating weeks or picking a slot. */
  baseParams: Record<string, string>;
  /** The currently chosen range, so the grid can show it. */
  selected: { date: string; from: string; to: string } | null;
}

const STEP_MIN = 15;
const ROW_PX = 12; // one quarter hour

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function minToHHMM(min: number): string {
  return `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`;
}

/** Berlin-local "YYYY-MM-DD" for a date N days after the week start. */
function dayString(weekStart: string, offset: number): string {
  const [y, m, d] = weekStart.split('-').map(Number);
  const dt = new Date(y, m - 1, d + offset);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

export function WeekBoard(props: WeekBoardProps) {
  const {
    weekStart,
    blocks,
    gridMinHour,
    gridMaxEndHour,
    closingHour,
    minDurationMinutes,
    lang,
    baseParams,
    selected,
  } = props;

  const router = useRouter();
  const [drag, setDrag] = useState<{ day: number; fromMin: number; toMin: number } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const startMin = gridMinHour * 60;
  const endMin = Math.min(gridMaxEndHour, 24) * 60;
  const rows = Math.max(1, (endMin - startMin) / STEP_MIN);

  const t =
    lang === 'en'
      ? { busy: 'Booked', closed: 'closed from', today: 'today', hint: 'Tap or drag in the calendar to pick a time.' }
      : { busy: 'Belegt', closed: 'Ab', today: 'heute', hint: 'Tippen oder ziehen Sie im Kalender, um einen Zeitraum zu wählen.' };

  const dayFmt = new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'de-DE', {
    weekday: 'short',
    day: 'numeric',
    month: 'numeric',
    timeZone: 'Europe/Berlin',
  });

  const todayString = useMemo(() => {
    const n = new Date();
    return `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`;
  }, []);

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => dayString(weekStart, i)),
    [weekStart],
  );

  /** Blocks bucketed per day, as minute offsets within that day. */
  const perDay = useMemo(() => {
    const out: Record<string, { fromMin: number; toMin: number; kind: string; title?: string | null; color?: string | null }[]> = {};
    for (const d of days) out[d] = [];

    for (const b of blocks) {
      const s = new Date(b.startsAt);
      const e = new Date(b.endsAt);
      // A block can span days; clip it into each day it touches.
      for (const d of days) {
        const [y, m, dd] = d.split('-').map(Number);
        const dayStart = new Date(y, m - 1, dd);
        const dayEnd = new Date(y, m - 1, dd + 1);
        if (s >= dayEnd || e <= dayStart) continue;
        const from = Math.max(0, Math.round((s.getTime() - dayStart.getTime()) / 60000));
        const to = Math.min(24 * 60, Math.round((e.getTime() - dayStart.getTime()) / 60000));
        if (to > from) {
          out[d].push({ fromMin: from, toMin: to, kind: b.kind, title: b.publicTitle, color: b.color });
        }
      }
    }
    return out;
  }, [blocks, days]);

  function minuteAt(clientY: number, columnTop: number): number {
    const offset = clientY - columnTop;
    const raw = startMin + (offset / ROW_PX) * STEP_MIN;
    const snapped = Math.round(raw / STEP_MIN) * STEP_MIN;
    return Math.min(endMin, Math.max(startMin, snapped));
  }

  function beginDrag(dayIndex: number, e: React.PointerEvent<HTMLDivElement>) {
    const top = e.currentTarget.getBoundingClientRect().top;
    const at = minuteAt(e.clientY, top);
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setDrag({ day: dayIndex, fromMin: at, toMin: at + minDurationMinutes });
  }

  function moveDrag(e: React.PointerEvent<HTMLDivElement>) {
    if (!drag) return;
    const top = e.currentTarget.getBoundingClientRect().top;
    const at = minuteAt(e.clientY, top);
    setDrag((d) => (d ? { ...d, toMin: Math.max(at, d.fromMin + minDurationMinutes) } : d));
  }

  function endDrag() {
    if (!drag) return;
    const date = days[drag.day];
    const from = minToHHMM(drag.fromMin);
    const to = minToHHMM(Math.min(drag.toMin, endMin));
    setDrag(null);

    const params = new URLSearchParams({ ...baseParams, date, from, to });
    router.push(`?${params.toString()}`, { scroll: false });
  }

  function weekLink(offsetDays: number): string {
    const params = new URLSearchParams({ ...baseParams, week: dayString(weekStart, offsetDays) });
    return `?${params.toString()}`;
  }

  const closingMin = closingHour != null ? Math.min(closingHour, 24) * 60 : null;

  return (
    <div className="wk">
      <div className="wk__bar">
        <strong>
          {dayFmt.format(new Date(`${days[0]}T12:00:00`))} – {dayFmt.format(new Date(`${days[6]}T12:00:00`))}
        </strong>
        <span className="topbar__spacer" />
        <a className="wk__nav" href={weekLink(-7)} aria-label="vorherige Woche">
          ‹
        </a>
        <a className="wk__nav" href={`?${new URLSearchParams(baseParams).toString()}`}>
          {t.today}
        </a>
        <a className="wk__nav" href={weekLink(7)} aria-label="nächste Woche">
          ›
        </a>
      </div>

      <p className="muted small" style={{ margin: '0 0 var(--s3)' }}>
        {t.hint}
      </p>

      <div className="wk__scroll">
        <div className="wk__grid" ref={gridRef} style={{ ['--wk-rows' as string]: rows }}>
          {/* Hour ruler */}
          <div className="wk__times">
            <div className="wk__dayhead" aria-hidden="true" />
            {Array.from({ length: Math.ceil((endMin - startMin) / 60) }, (_, i) => (
              <div key={i} className="wk__time" style={{ height: (60 / STEP_MIN) * ROW_PX }}>
                {pad(Math.floor((startMin + i * 60) / 60) % 24)}:00
              </div>
            ))}
          </div>

          {days.map((d, i) => {
            const isToday = d === todayString;
            const isSelectedDay = selected?.date === d;
            return (
              <div className={`wk__col${isToday ? ' wk__col--today' : ''}`} key={d}>
                <div className="wk__dayhead">{dayFmt.format(new Date(`${d}T12:00:00`))}</div>

                <div
                  className="wk__slots"
                  style={{ height: rows * ROW_PX }}
                  onPointerDown={(e) => beginDrag(i, e)}
                  onPointerMove={moveDrag}
                  onPointerUp={endDrag}
                  onPointerCancel={() => setDrag(null)}
                >
                  {/* Quarter-hour guides, drawn as a repeating gradient rather
                      than 60 elements per day. */}
                  <div className="wk__rules" aria-hidden="true" />

                  {closingMin != null && closingMin < endMin && (
                    <div
                      className="wk__closed"
                      style={{
                        top: ((closingMin - startMin) / STEP_MIN) * ROW_PX,
                        height: ((endMin - closingMin) / STEP_MIN) * ROW_PX,
                      }}
                    >
                      <span>
                        {t.closed} {pad(closingHour ?? 0)}:00
                      </span>
                    </div>
                  )}

                  {(perDay[d] ?? []).map((b, bi) => {
                    const top = ((Math.max(b.fromMin, startMin) - startMin) / STEP_MIN) * ROW_PX;
                    const height =
                      ((Math.min(b.toMin, endMin) - Math.max(b.fromMin, startMin)) / STEP_MIN) * ROW_PX;
                    if (height <= 0) return null;
                    return (
                      <div
                        key={bi}
                        className={`wk__block wk__block--${b.kind}`}
                        style={{ top, height, ...(b.color ? { background: b.color } : {}) }}
                        title={b.title ?? t.busy}
                      >
                        <span className="wk__blocktime">
                          {minToHHMM(b.fromMin)} – {minToHHMM(b.toMin)}
                        </span>
                        <span className="wk__blocklabel">{b.title ?? t.busy}</span>
                      </div>
                    );
                  })}

                  {drag?.day === i && (
                    <div
                      className="wk__pick"
                      style={{
                        top: ((drag.fromMin - startMin) / STEP_MIN) * ROW_PX,
                        height: ((drag.toMin - drag.fromMin) / STEP_MIN) * ROW_PX,
                      }}
                    >
                      {minToHHMM(drag.fromMin)} – {minToHHMM(drag.toMin)}
                    </div>
                  )}

                  {!drag && isSelectedDay && selected && (
                    <div
                      className="wk__pick"
                      style={{
                        top:
                          ((Number(selected.from.slice(0, 2)) * 60 +
                            Number(selected.from.slice(3, 5)) -
                            startMin) /
                            STEP_MIN) *
                          ROW_PX,
                        height:
                          ((Number(selected.to.slice(0, 2)) * 60 +
                            Number(selected.to.slice(3, 5)) -
                            (Number(selected.from.slice(0, 2)) * 60 +
                              Number(selected.from.slice(3, 5)))) /
                            STEP_MIN) *
                          ROW_PX,
                      }}
                    >
                      {selected.from} – {selected.to}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

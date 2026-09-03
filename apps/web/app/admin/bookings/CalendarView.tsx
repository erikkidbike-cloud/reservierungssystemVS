import Link from 'next/link';
import type { Booking, StaffBooking, BlockRow } from '@/lib/db-types';
import type { BookingStatus } from '@vs/domain';
import { STATUS_LABEL, statusBadgeClass } from '@/lib/booking-labels';

interface CalendarProps {
  bookings: Array<Booking | StaffBooking>;
  blocks: BlockRow[];
  year: number;
  month: number; // 0-indexed (0 = Jan, 8 = Sep)
  locationFilter?: string;
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}

export default function CalendarView({
  bookings,
  blocks,
  year,
  month,
  locationFilter,
}: CalendarProps) {
  // Compute month boundaries
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  // Month navigation helpers
  const prevMonth = month === 0 ? 11 : month - 1;
  const prevYear = month === 0 ? year - 1 : year;
  const nextMonth = month === 11 ? 0 : month + 1;
  const nextYear = month === 11 ? year + 1 : year;

  const prevQuery = `/admin/bookings?view=calendar&month=${prevYear}-${pad(prevMonth + 1)}${locationFilter ? `&location=${locationFilter}` : ''}`;
  const nextQuery = `/admin/bookings?view=calendar&month=${nextYear}-${pad(nextMonth + 1)}${locationFilter ? `&location=${locationFilter}` : ''}`;
  const todayQuery = `/admin/bookings?view=calendar${locationFilter ? `&location=${locationFilter}` : ''}`;

  const monthLabel = firstDay.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });

  // Compute grid days: Monday to Sunday
  // getDay(): 0 is Sunday, 1 is Monday ... 6 is Saturday
  const startDayOfWeek = (firstDay.getDay() + 6) % 7; // 0 = Mon, 6 = Sun
  const totalDays = lastDay.getDate();

  const days: { dateStr: string; dayNum: number; isCurrentMonth: boolean }[] = [];

  // Previous month padding
  const prevMonthLastDay = new Date(year, month, 0).getDate();
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    const d = prevMonthLastDay - i;
    days.push({
      dateStr: `${prevYear}-${pad(prevMonth + 1)}-${pad(d)}`,
      dayNum: d,
      isCurrentMonth: false,
    });
  }

  // Current month days
  for (let d = 1; d <= totalDays; d++) {
    days.push({
      dateStr: `${year}-${pad(month + 1)}-${pad(d)}`,
      dayNum: d,
      isCurrentMonth: true,
    });
  }

  // Next month padding to fill complete weeks (multiples of 7)
  const remaining = 7 - (days.length % 7);
  if (remaining < 7) {
    for (let d = 1; d <= remaining; d++) {
      days.push({
        dateStr: `${nextYear}-${pad(nextMonth + 1)}-${pad(d)}`,
        dayNum: d,
        isCurrentMonth: false,
      });
    }
  }

  const todayStr = new Date().toISOString().slice(0, 10);

  // Group bookings by date YYYY-MM-DD
  const bookingsByDate: Record<string, Array<Booking | StaffBooking>> = {};
  for (const b of bookings) {
    const dStr = b.starts_at.slice(0, 10);
    if (!bookingsByDate[dStr]) bookingsByDate[dStr] = [];
    bookingsByDate[dStr].push(b);
  }

  // Group blocks by date YYYY-MM-DD
  const blocksByDate: Record<string, BlockRow[]> = {};
  for (const bl of blocks) {
    const dStr = bl.starts_at.slice(0, 10);
    if (!blocksByDate[dStr]) blocksByDate[dStr] = [];
    blocksByDate[dStr].push(bl);
  }

  const weekHeaders = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

  return (
    <div style={{ marginTop: 16 }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div className="row" style={{ alignItems: 'center', gap: 12, marginBottom: 0 }}>
          <h2 style={{ margin: 0 }}>{monthLabel}</h2>
          <div className="row" style={{ gap: 6, marginBottom: 0 }}>
            <Link href={prevQuery}>
              <button type="button" className="secondary" style={{ padding: '4px 10px' }}>
                ← Zurück
              </button>
            </Link>
            <Link href={todayQuery}>
              <button type="button" className="secondary" style={{ padding: '4px 10px' }}>
                Heute
              </button>
            </Link>
            <Link href={nextQuery}>
              <button type="button" className="secondary" style={{ padding: '4px 10px' }}>
                Weiter →
              </button>
            </Link>
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: 6,
          background: 'var(--panel-border, #e0e0e0)',
          padding: 6,
          borderRadius: 8,
        }}
      >
        {weekHeaders.map((w) => (
          <div
            key={w}
            style={{
              padding: '8px 4px',
              textAlign: 'center',
              fontWeight: 600,
              fontSize: '0.85rem',
              color: 'var(--fg)',
            }}
          >
            {w}
          </div>
        ))}

        {days.map((day, idx) => {
          const isToday = day.dateStr === todayStr;
          const dayBookings = bookingsByDate[day.dateStr] ?? [];
          const dayBlocks = blocksByDate[day.dateStr] ?? [];

          return (
            <div
              key={idx}
              style={{
                minHeight: 110,
                background: day.isCurrentMonth ? '#ffffff' : '#f8f9fa',
                borderRadius: 6,
                padding: '6px 8px',
                border: isToday ? '2px solid var(--accent, #1971c2)' : '1px solid transparent',
                opacity: day.isCurrentMonth ? 1 : 0.6,
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 4,
                }}
              >
                <span
                  style={{
                    fontSize: '0.85rem',
                    fontWeight: isToday ? 700 : 500,
                    color: isToday ? 'var(--accent, #1971c2)' : 'inherit',
                  }}
                >
                  {day.dayNum}
                </span>
                {isToday && (
                  <span
                    style={{
                      fontSize: '0.7rem',
                      background: 'var(--accent, #1971c2)',
                      color: '#fff',
                      padding: '1px 4px',
                      borderRadius: 4,
                    }}
                  >
                    Heute
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, overflowY: 'auto' }}>
                {dayBlocks.map((bl) => (
                  <div
                    key={bl.id}
                    title={bl.title ?? 'Sperre'}
                    style={{
                      fontSize: '0.72rem',
                      padding: '2px 4px',
                      borderRadius: 4,
                      background: '#fff3bf',
                      color: '#664d03',
                      border: '1px solid #ffe066',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    🚫 {bl.title || 'Sperre'}
                  </div>
                ))}

                {dayBookings.map((b) => {
                  const startTime = b.starts_at.slice(11, 16);
                  const endTime = b.ends_at.slice(11, 16);
                  return (
                    <Link
                      key={b.id}
                      href={`/admin/bookings/${b.id}`}
                      style={{ textDecoration: 'none' }}
                    >
                      <div
                        title={`${b.location_code} · ${startTime}–${endTime} · ${STATUS_LABEL[b.status as BookingStatus] ?? b.status}`}
                        style={{
                          fontSize: '0.72rem',
                          padding: '2px 4px',
                          borderRadius: 4,
                          background: b.status === 'confirmed' ? '#e6fcf5' : '#e7f5ff',
                          color: b.status === 'confirmed' ? '#087f5b' : '#1864ab',
                          border: `1px solid ${b.status === 'confirmed' ? '#96f2d7' : '#a5d8ff'}`,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          cursor: 'pointer',
                        }}
                      >
                        <strong>{b.location_code}</strong> {startTime} {b.event_type ? `· ${b.event_type}` : ''}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

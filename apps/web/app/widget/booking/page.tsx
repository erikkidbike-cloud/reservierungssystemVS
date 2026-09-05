// The embeddable booking widget: what kidbike.de puts in an iframe.
//
// Replaces the legacy widget (reference/legacy-kidbike-json/index.html) and
// keeps what it did well: a location and language chooser in the header, a
// whole week of occupancy at a glance, click-or-drag to pick a slot, and a
// request form with a live price. It adds what that one could not: the price
// comes from @vs/pricing — the module the server actually charges from — and
// the request lands in the database as a hold rather than in an inbox.
//
// DELIBERATELY NOT PORTED: the map in the location chooser. The old one drew
// Carto tiles without a key, so every screenshot of it carries "API KEY
// REQUIRED" across the map — it had stopped working. Three venues in one
// district are a list, not a map; each card carries its address and links to
// it. If a map is wanted later it needs a tile plan, which is a decision about
// money rather than about code.
//
// Embedding, in the WordPress page:
//
//   <iframe src="https://<site>/widget/booking?school=WE"
//           style="width:100%;border:0" title="Belegung Verkehrsschulen"></iframe>
//   <script>
//     addEventListener('message', function (e) {
//       if (e.data && e.data.type === 'embed-size') {
//         document.querySelector('iframe[title="Belegung Verkehrsschulen"]')
//           .style.height = e.data.height + 'px';
//       }
//     });
//   </script>
//
// The height message is emitted by BookingWizard, the same protocol
// /widget/events uses.

import { cookies } from 'next/headers';
import { serverClient } from '@/lib/supabase';
import { loadActiveLocations, loadTariffConfig } from '@/lib/booking-pricing';
import { toPublicLocation } from '@/lib/public-location';
import { todayInBerlin } from '@/lib/berlin-time';
import BookingWizard, { type DayBlock } from '../../book/BookingWizard';
import { WeekBoard, type WeekBlock } from './WeekBoard';
import { BrandMark } from '../../BrandMark';

export const dynamic = 'force-dynamic';

interface Params {
  school?: string;
  week?: string;
  date?: string;
  from?: string;
  to?: string;
  lang?: string;
}

function isDate(s: string | undefined): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function isTime(s: string | undefined): s is string {
  return !!s && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** The Monday on or before `date`. The old widget's weeks ran Mon–Sun. */
function mondayOf(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const shift = (dt.getDay() + 6) % 7; // Sunday is 0 in JS, but last here
  const mon = new Date(y, m - 1, d - shift);
  return `${mon.getFullYear()}-${pad(mon.getMonth() + 1)}-${pad(mon.getDate())}`;
}

function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

export default async function BookingWidget({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const params = await searchParams;
  const lang: 'de' | 'en' = params.lang === 'en' ? 'en' : 'de';
  const locations = await loadActiveLocations();

  const code = (params.school ?? '').trim().toUpperCase();
  const location = locations.find((l) => l.code === code) ?? null;

  const t =
    lang === 'en'
      ? {
          title: 'Availability — traffic schools',
          school: 'Location',
          language: 'Language',
          choose: 'Please choose your traffic school.',
          intro: 'Blue blocks are already taken. Tap or drag in the calendar to pick a time and send a request.',
          hint: 'Your request is non-binding. We reply by email with a confirmation.',
          phoneOnly: 'By phone only',
          online: 'Bookable online',
          offline: 'Not bookable at the moment',
          pick: 'Choose',
        }
      : {
          title: 'Belegung Verkehrsschulen',
          school: 'Standort',
          language: 'Sprache',
          choose: 'Bitte wählen Sie Ihre Verkehrsschule.',
          intro: 'Blaue Blöcke sind bereits belegt. Tippen oder ziehen Sie im Kalender, um einen Zeitraum auszuwählen und eine Anfrage zu senden.',
          hint: 'Ihre Anfrage ist unverbindlich. Wir melden uns per E-Mail mit einer Bestätigung.',
          phoneOnly: 'Telefonisch buchbar',
          online: 'Online buchbar',
          offline: 'Derzeit nicht buchbar',
          pick: 'Auswählen',
        };

  // --- no location yet: the chooser -------------------------------------
  if (!location) {
    return (
      <div className="widget">
        <WidgetHeader title={t.title} />
        <div className="widget__body">
          <h2 style={{ marginTop: 0 }}>{t.choose}</h2>
          <div className="cards">
            {locations.map((l) => (
              <div className="card" key={l.id}>
                <h3 style={{ marginTop: 0 }}>{l.name}</h3>
                <p className="muted small">{l.address}</p>
                <span
                  className={l.online_bookability === 'online' ? 'badge badge--ok' : 'badge'}
                  style={{ marginBottom: 12, display: 'inline-block' }}
                >
                  {l.online_bookability === 'online'
                    ? t.online
                    : l.online_bookability === 'phone_only'
                      ? t.phoneOnly
                      : t.offline}
                </span>
                <p style={{ margin: 0 }}>
                  <a className="btnlink" href={`?school=${l.code}&lang=${lang}`}>
                    {t.pick}
                  </a>
                </p>
              </div>
            ))}
          </div>
        </div>
        <EmbedSize />
      </div>
    );
  }

  const today = todayInBerlin();
  const week = mondayOf(isDate(params.week) ? params.week : isDate(params.date) ? params.date : today);
  const weekEnd = addDays(week, 7);

  const supabase = serverClient(await cookies());
  const { data: weekRows } = await supabase
    .from('public_availability')
    .select('starts_at, ends_at, kind, public_title, color')
    .eq('location_code', location.code)
    .lt('starts_at', `${weekEnd}T00:00:00+02:00`)
    .gt('ends_at', `${week}T00:00:00+02:00`)
    .order('starts_at');

  const blocks: WeekBlock[] = ((weekRows ?? []) as Array<{
    starts_at: string;
    ends_at: string;
    kind: WeekBlock['kind'];
    public_title: string | null;
    color: string | null;
  }>).map((r) => ({
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    kind: r.kind,
    publicTitle: r.public_title,
    color: r.color,
  }));

  // A slot picked in the grid: the request form below opens on that day.
  const selectedDate = isDate(params.date) ? params.date : null;
  const selected =
    selectedDate && isTime(params.from) && isTime(params.to)
      ? { date: selectedDate, from: params.from, to: params.to }
      : null;

  // The wizard needs one day's blocks — the day that was picked.
  const dayBlocks: DayBlock[] = selectedDate
    ? blocks
        .filter((b) => {
          const s = new Date(b.startsAt);
          const [y, m, d] = selectedDate.split('-').map(Number);
          return s < new Date(y, m - 1, d + 1) && new Date(b.endsAt) > new Date(y, m - 1, d);
        })
        .map((b) => ({
          startsAt: b.startsAt,
          endsAt: b.endsAt,
          kind: b.kind,
          publicTitle: b.publicTitle,
          color: b.color,
        }))
    : [];

  let tariffConfig = null;
  let tariffError: string | null = null;
  try {
    tariffConfig = await loadTariffConfig(location.id, 'standard');
  } catch (err) {
    tariffError = (err as Error).message;
  }

  const bookedDates = Array.from(
    new Set(blocks.map((b) => new Date(b.startsAt).toISOString().slice(0, 10))),
  );

  return (
    <div className="widget">
      <WidgetHeader title={t.title}>
        <label className="widget__field">
          {t.school}
          <select name="school" defaultValue={location.code} data-widget-nav="school">
            {locations.map((l) => (
              <option key={l.id} value={l.code}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <label className="widget__field">
          {t.language}
          <select name="lang" defaultValue={lang} data-widget-nav="lang">
            <option value="de">Deutsch</option>
            <option value="en">English</option>
          </select>
        </label>
      </WidgetHeader>

      <div className="widget__body">
        <div className="notice notice--ok" style={{ marginTop: 0 }}>
          <p style={{ marginBottom: 4 }}>{t.intro}</p>
          <p className="muted small" style={{ margin: 0 }}>
            {t.hint}
          </p>
        </div>

        <WeekBoard
          weekStart={week}
          blocks={blocks}
          gridMinHour={location.grid_min_hour}
          gridMaxEndHour={location.grid_max_end_hour}
          closingHour={location.closing_hour}
          minDurationMinutes={location.min_duration_minutes}
          lang={lang}
          baseParams={{ school: location.code, lang }}
          selected={selected}
        />

        {selected && (
          <div style={{ marginTop: 'var(--s5)' }}>
            <BookingWizard
              location={toPublicLocation(location)}
              date={selected.date}
              dayBlocks={dayBlocks}
              bookedDates={bookedDates}
              tariffConfig={tariffConfig}
              tariffError={tariffError}
              initialFrom={selected.from}
              initialTo={selected.to}
              hideDayBar
            />
          </div>
        )}
      </div>

      <WidgetNav />
      <EmbedSize />
    </div>
  );
}

function WidgetHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <header className="widget__head">
      <a href="https://www.kidbike.de" target="_blank" rel="noopener noreferrer">
        <BrandMark height={26} />
      </a>
      <strong className="widget__title">{title}</strong>
      <span className="topbar__spacer" />
      {children}
    </header>
  );
}

/**
 * The two selects navigate. A three-line inline script rather than a client
 * component: the whole widget is otherwise server-rendered, and pulling React
 * onto the page for two `change` handlers is a poor trade in an iframe someone
 * else's site pays to load.
 */
function WidgetNav() {
  return (
    <script
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{
        __html: `
          document.querySelectorAll('[data-widget-nav]').forEach(function (el) {
            el.addEventListener('change', function () {
              var p = new URLSearchParams(location.search);
              p.set(el.getAttribute('data-widget-nav') === 'lang' ? 'lang' : 'school', el.value);
              p.delete('date'); p.delete('from'); p.delete('to');
              location.search = p.toString();
            });
          });
        `,
      }}
    />
  );
}

/** Tell the embedding page how tall to make the frame. */
function EmbedSize() {
  return (
    <script
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{
        __html: `
          (function(){
            function report(){
              parent.postMessage({ type: 'embed-size', height: document.documentElement.scrollHeight }, '*');
            }
            report();
            new ResizeObserver(report).observe(document.documentElement);
          })();
        `,
      }}
    />
  );
}

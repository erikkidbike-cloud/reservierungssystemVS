// Embeddable "upcoming events" widget — reads the same public_availability
// view /book's calendar does, filtered to kind='project' (special events, see
// /admin/events). No client JS beyond the embed-size postMessage (a plain
// inline script, not a React effect, since nothing else here is interactive):
// clicking an event either follows its link or expands a native <details>
// popup with its description — both work with zero JavaScript.
//
// Query params: ?categories=frauenprojekt,sommerfest (project codes, comma-
// separated; omit for all categories), &location=WE (a location code; omit
// for all locations), &limit=10 (default 10, max 50).

import { cookies } from 'next/headers';
import { serverClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

interface EventRow {
  location_code: string;
  starts_at: string;
  ends_at: string;
  public_title: string | null;
  public_link: string | null;
  color: string | null;
  public_description: string | null;
  project_code: string | null;
}

function fmtRange(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const day = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeZone: 'Europe/Berlin' }).format(start);
  const timeFmt = new Intl.DateTimeFormat('de-DE', { timeStyle: 'short', timeZone: 'Europe/Berlin' });
  return `${day}, ${timeFmt.format(start)}–${timeFmt.format(end)} Uhr`;
}

export default async function EventsWidgetPage({
  searchParams,
}: {
  searchParams: Promise<{ categories?: string; location?: string; limit?: string }>;
}) {
  const params = await searchParams;
  const categories = (params.categories ?? '')
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);
  const limit = Math.min(50, Math.max(1, Number(params.limit) || 10));

  const supabase = serverClient(await cookies());
  let query = supabase
    .from('public_availability')
    .select('location_code, starts_at, ends_at, public_title, public_link, color, public_description, project_code')
    .eq('kind', 'project')
    .gte('starts_at', new Date().toISOString())
    .order('starts_at')
    .limit(limit);

  if (categories.length > 0) query = query.in('project_code', categories);
  if (params.location) query = query.eq('location_code', params.location.toUpperCase());

  const { data, error } = await query;
  const events = (data ?? []) as EventRow[];

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: 12 }}>
      {error && <p style={{ color: '#b3261e' }}>Konnte Termine nicht laden.</p>}
      {!error && events.length === 0 && (
        <p style={{ color: '#5f666b', fontSize: 14 }}>Aktuell keine anstehenden Termine.</p>
      )}
      {events.map((ev, i) => {
        const title = ev.public_title || 'Veranstaltung';
        const color = ev.color || '#0b7a3b';
        const card = (
          <div
            style={{
              borderLeft: `4px solid ${color}`,
              background: '#fff',
              boxShadow: '0 1px 2px rgba(16,24,20,0.08)',
              borderRadius: 6,
              padding: '10px 14px',
              marginBottom: 10,
            }}
          >
            <strong style={{ fontSize: 15 }}>{title}</strong>
            <div style={{ fontSize: 13, color: '#5f666b', marginTop: 2 }}>
              {fmtRange(ev.starts_at, ev.ends_at)} · {ev.location_code}
            </div>
          </div>
        );

        if (ev.public_link) {
          return (
            <a
              key={i}
              href={ev.public_link}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}
            >
              {card}
            </a>
          );
        }

        if (ev.public_description) {
          return (
            <details key={i} style={{ marginBottom: 0 }}>
              <summary style={{ listStyle: 'none', cursor: 'pointer' }}>{card}</summary>
              <p style={{ fontSize: 13, color: '#16181a', margin: '-4px 0 12px 18px' }}>
                {ev.public_description}
              </p>
            </details>
          );
        }

        return <div key={i}>{card}</div>;
      })}

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
              document.addEventListener('toggle', report, true);
            })();
          `,
        }}
      />
    </div>
  );
}

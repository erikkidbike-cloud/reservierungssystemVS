// Address autocomplete, proxied.
//
// The browser never talks to the geocoder directly, for two reasons: a
// visitor's IP address would otherwise be handed to a third party on every
// keystroke-pause (a GDPR question nobody needs to answer), and a public
// endpoint called straight from the page is an open relay to somebody else's
// service. Going through here means one server IP, our own rate limit, and a
// response shaped for the form rather than for a map.
//
// Photon is OpenStreetMap data (photon.komoot.io), free for this kind of use
// and key-less. It fails soft: any error returns an empty list, and the form
// then offers its "use this address anyway" override — a geocoder being down
// must never stop a booking.

import { NextResponse } from 'next/server';
import { checkRateLimit, type RateLimitRule } from '@/lib/rate-limit';
import { text } from '@/lib/input';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Its own bucket: typing an address is far chattier than submitting a form. */
const ADDRESS_LIMITS: { perIp: RateLimitRule; global: RateLimitRule } = {
  perIp: { name: 'address:ip', limit: 120, windowSeconds: 3600 },
  global: { name: 'address:all', limit: 2000, windowSeconds: 3600 },
};

/** Berlin, so local results come first without excluding anywhere else. */
const BIAS = { lat: 52.52, lon: 13.405 };

interface PhotonFeature {
  properties?: {
    name?: string;
    street?: string;
    housenumber?: string;
    postcode?: string;
    city?: string;
    district?: string;
    state?: string;
    country?: string;
    countrycode?: string;
    osm_key?: string;
  };
}

export async function GET(request: Request): Promise<Response> {
  const q = text(new URL(request.url).searchParams.get('q'), 120);
  if (!q || q.length < 4) return NextResponse.json({ results: [] });

  const rate = await checkRateLimit(request, ADDRESS_LIMITS);
  if (!rate.allowed) {
    console.warn(`[address-search] rate limit hit: ${rate.tripped}`);
    // Empty rather than 429: the form's own fallback is exactly the right
    // behaviour here, and a visitor typing quickly should not see an error.
    return NextResponse.json({ results: [] });
  }

  const url =
    `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}` +
    `&limit=6&lang=de&lat=${BIAS.lat}&lon=${BIAS.lon}`;

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(4000),
      headers: { 'user-agent': 'KidBike-Reservierung (kontakt: info@kidbike.de)' },
    });
    if (!res.ok) throw new Error(`photon ${res.status}`);

    const body = (await res.json()) as { features?: PhotonFeature[] };

    const results = (body.features ?? [])
      .map((f) => {
        const p = f.properties ?? {};
        // Photon puts the street in `name` for a street-level hit and in
        // `street` once a house number is attached.
        const street = p.street ?? p.name ?? '';
        const house = p.housenumber ?? '';
        const zip = p.postcode ?? '';
        const city = p.city ?? p.district ?? p.state ?? '';
        if (!street || !city) return null;

        const label = [
          [street, house].filter(Boolean).join(' '),
          [zip, city].filter(Boolean).join(' '),
          p.countrycode && p.countrycode !== 'DE' ? p.country : null,
        ]
          .filter(Boolean)
          .join(', ');

        return { street, house, zip, city, label };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      // Photon happily returns the same street twice at different house
      // numbers when the query has none; one line per distinct label.
      .filter((r, i, all) => all.findIndex((o) => o.label === r.label) === i);

    return NextResponse.json(
      { results },
      { headers: { 'cache-control': 'private, max-age=60' } },
    );
  } catch (err) {
    console.error('[address-search] lookup failed:', (err as Error).message);
    return NextResponse.json({ results: [] });
  }
}

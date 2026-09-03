'use client';

// The public booking wizard: time & price, then contact & conditions, then
// submit. Runs entirely client-side once the server has handed it a day's
// worth of data, so picking a time or an extra re-prices instantly with zero
// round trip — using @vs/pricing directly, the exact module the server uses
// to compute the price it will actually charge (see lib/booking-pricing.ts).
// That shared module is what makes "the preview equals what gets charged" true
// by construction rather than by two implementations happening to agree.
//
// Deliberate scope cut from the legacy calendar (reference/legacy-kidbike-json
// /index.html): this views and books ONE calendar day at a time, with a click-
// to-set-start time bar plus precise time inputs, rather than a multi-week
// drag-select grid. A location's occupancy is still fully visible (via the day
// bar and the "has bookings" dots on the date picker) and every business rule
// still applies — this is a UI simplification, not a rule relaxation. A
// cross-midnight event (rare — a location either closes by 22:00 or has no
// closing hour at all) isn't reachable from this form; the internal booking
// form (/admin/bookings/new) or a phone call cover that case.

import { useEffect, useMemo, useState } from 'react';
import {
  computePrice,
  validateRequest,
  type TariffConfig,
  type LocationRules,
  type ValidationCode,
} from '@vs/pricing';
import {
  parseLocalDateTime,
  formatLocalDate,
  addDaysToDateString,
  clampToDayMinutes,
} from '@/lib/berlin-time';
import { I18N, getTermsForSchool, publicErrorMessage, type Lang } from '@/lib/public-i18n';

export interface DayBlock {
  startsAt: string;
  endsAt: string;
  kind: 'busy' | 'hold' | 'project';
  /** Only ever set for kind='project' (a special event — see /admin/events). */
  publicTitle?: string | null;
  publicLink?: string | null;
  color?: string | null;
  publicDescription?: string | null;
}

export interface PublicLocation {
  code: string;
  name: string;
  address: string | null;
  phone: string | null;
  onlineBookability: 'online' | 'phone_only' | 'offline';
  closingHour: number | null;
  minLeadDays: number;
  minDurationMinutes: number;
  gridMinHour: number;
  gridMaxEndHour: number;
}

interface Props {
  location: PublicLocation;
  date: string; // YYYY-MM-DD, the Berlin calendar day being viewed
  dayBlocks: DayBlock[];
  bookedDates: string[]; // dates in the browsing window that have any occupancy
  tariffConfig: TariffConfig | null;
  tariffError: string | null;
}

function roundToStep(minutes: number, step = 15): number {
  return Math.round(minutes / step) * step;
}
function minToHHMM(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
function hhmmToMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
}

export default function BookingWizard({
  location,
  date,
  dayBlocks,
  bookedDates,
  tariffConfig,
  tariffError,
}: Props) {
  const [lang, setLang] = useState<Lang>('de');
  const t = I18N[lang];
  const bookedSet = useMemo(() => new Set(bookedDates), [bookedDates]);

  // Embed-size protocol, ported from index.html: the parent page (the WordPress
  // iframe embed) resizes the frame to whatever this document reports, so the
  // form never scrolls inside a fixed-height box.
  useEffect(() => {
    const report = () => {
      const h = document.documentElement.scrollHeight;
      window.parent?.postMessage({ type: 'embed-size', height: h }, '*');
    };
    report();
    const obs = new ResizeObserver(report);
    obs.observe(document.documentElement);
    return () => obs.disconnect();
  }, []);

  const [step, setStep] = useState<1 | 2>(1);
  const gridStartMin = location.gridMinHour * 60;
  const gridEndMin = Math.min(location.gridMaxEndHour, 24) * 60;
  const defaultStart = Math.max(gridStartMin, roundToStep(14 * 60));

  const [fromTime, setFromTime] = useState(minToHHMM(defaultStart));
  const [toTime, setToTime] = useState(minToHHMM(Math.min(defaultStart + 120, gridEndMin)));
  const [persons, setPersons] = useState('');
  const [eventType, setEventType] = useState('');
  const [extras, setExtras] = useState<string[]>([]);
  const [extraQuantities, setExtraQuantities] = useState<Record<string, string>>({});
  const [bikeCount, setBikeCount] = useState('');

  const [salutation, setSalutation] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [street, setStreet] = useState('');
  const [house, setHouse] = useState('');
  const [zip, setZip] = useState('');
  const [city, setCity] = useState('');
  const [organization, setOrganization] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [accept, setAccept] = useState(false);

  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<{ from: string; to: string } | null>(null);
  const [activeEvent, setActiveEvent] = useState<DayBlock | null>(null);

  const [showWaitlist, setShowWaitlist] = useState(false);
  const [waitlistStatus, setWaitlistStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [waitlistError, setWaitlistError] = useState<string | null>(null);

  const start = parseLocalDateTime(`${date}T${fromTime}`);
  const end = parseLocalDateTime(`${date}T${toTime}`);
  const personsNum = Number(persons) || 0;

  const rules: LocationRules = {
    closingHour: location.closingHour,
    minLeadDays: location.minLeadDays,
    minDurationMinutes: location.minDurationMinutes,
  };

  // Time-shape validation runs the identical function the server runs
  // (validateRequest). Overlap is checked separately below, in minute-space —
  // see clampToDayMinutes's docstring for why a plain Date comparison would be
  // unsafe here (a visitor's browser is not necessarily in Europe/Berlin).
  const timeErrors: ValidationCode[] =
    start && end ? validateRequest({ start, end, rules }).errors : ['invalid_range'];

  const overlapsExisting = useMemo(() => {
    if (!start || !end) return false;
    const s = hhmmToMin(fromTime);
    const e = hhmmToMin(toTime);
    return dayBlocks.some((b) => {
      const [bs, be] = clampToDayMinutes(b.startsAt, b.endsAt, date);
      return s < be && e > bs;
    });
  }, [dayBlocks, date, fromTime, toTime, start, end]);

  const allErrors: ValidationCode[] = overlapsExisting ? [...timeErrors, 'overlap'] : timeErrors;
  const timeOk = allErrors.length === 0;

  const extraQuantitiesNum = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [id, v] of Object.entries(extraQuantities)) {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) out[id] = n;
    }
    return out;
  }, [extraQuantities]);

  const price = useMemo(() => {
    if (!tariffConfig || !start || !end || !timeOk || personsNum <= 0) return null;
    return computePrice(
      {
        start,
        end,
        persons: personsNum,
        extras,
        extraQuantities: extraQuantitiesNum,
        bikes: bikeCount ? { total: Number(bikeCount) || 0 } : undefined,
        lang,
      },
      tariffConfig,
    );
  }, [tariffConfig, start, end, timeOk, personsNum, extras, extraQuantitiesNum, bikeCount, lang]);

  function toggleExtra(id: string) {
    setExtras((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function handleBarClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const rangeMin = gridEndMin - gridStartMin;
    const clicked = roundToStep(gridStartMin + frac * rangeMin);
    const duration = hhmmToMin(toTime) - hhmmToMin(fromTime);
    const newFrom = Math.min(clicked, gridEndMin - Math.max(duration, location.minDurationMinutes));
    setFromTime(minToHHMM(newFrom));
    setToTime(minToHHMM(newFrom + Math.max(duration, location.minDurationMinutes)));
  }

  const canGoToContact = timeOk && personsNum > 0 && (!tariffConfig ? false : true) && !tariffError;

  async function submit() {
    if (!start || !end) return;
    setStatus('sending');
    setSubmitError(null);
    try {
      const res = await fetch('/api/booking-request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          school: location.code,
          from: `${date}T${fromTime}`,
          to: `${date}T${toTime}`,
          persons: personsNum,
          extras,
          extra_quantities: extraQuantitiesNum,
          bikes: bikeCount ? { total: Number(bikeCount) || 0 } : undefined,
          event_type: eventType || undefined,
          message: message || undefined,
          lang,
          salutation: salutation || undefined,
          first_name: firstName || undefined,
          last_name: lastName || undefined,
          street: street || undefined,
          house: house || undefined,
          zip: zip || undefined,
          city: city || undefined,
          organization: organization || undefined,
          email,
          phone: phone || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setSubmitError(publicErrorMessage(json.error ?? 'server_error', lang));
        setStatus('error');
        return;
      }
      setConfirmed({ from: fromTime, to: toTime });
      setStatus('success');
    } catch {
      setSubmitError(publicErrorMessage('server_error', lang));
      setStatus('error');
    }
  }

  async function submitWaitlist() {
    if (!start || !end) return;
    const name = [firstName, lastName].filter(Boolean).join(' ').trim();
    if (!name || !email) {
      setWaitlistError(lang === 'en' ? 'Please provide your name and email.' : 'Bitte Vorname, Nachname und E-Mail angeben.');
      return;
    }
    setWaitlistStatus('sending');
    setWaitlistError(null);
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          school: location.code,
          from: `${date}T${fromTime}`,
          to: `${date}T${toTime}`,
          persons: personsNum || undefined,
          customer_name: name,
          customer_email: email,
          customer_phone: phone || undefined,
          message: message || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setWaitlistError(publicErrorMessage(json.error ?? 'server_error', lang));
        setWaitlistStatus('error');
        return;
      }
      setWaitlistStatus('success');
    } catch {
      setWaitlistError(publicErrorMessage('server_error', lang));
      setWaitlistStatus('error');
    }
  }

  if (location.onlineBookability !== 'online') {
    return (
      <div className="panel">
        <h2 style={{ marginTop: 0 }}>{t.phoneInfoTitle(location.name)}</h2>
        <p style={{ whiteSpace: 'pre-line' }}>{t.phoneInfoText(location.phone ?? '—')}</p>
      </div>
    );
  }

  if (status === 'success' && confirmed) {
    return (
      <div className="panel">
        <h2 style={{ marginTop: 0 }}>{t.successTitle}</h2>
        <p>{t.successLead}</p>
        <table style={{ marginBottom: 16 }}>
          <tbody>
            <tr>
              <th>{t.formSchool}</th>
              <td>{location.name}</td>
            </tr>
            <tr>
              <th>{t.date}</th>
              <td>{date}</td>
            </tr>
            <tr>
              <th>{t.from}</th>
              <td>{confirmed.from}</td>
            </tr>
            <tr>
              <th>{t.to}</th>
              <td>{confirmed.to}</td>
            </tr>
          </tbody>
        </table>
        <a href={`/book?school=${location.code}`}>
          <button type="button" className="secondary">
            {t.successBack}
          </button>
        </a>
      </div>
    );
  }

  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="wizard-steps" style={{ flex: 1, maxWidth: 360 }}>
          <div className={`wizard-step ${step === 1 ? 'active' : ''}`}>1. {t.stepTime}</div>
          <div className={`wizard-step ${step === 2 ? 'active' : ''}`}>2. {t.stepContact}</div>
        </div>
        <div className="row" style={{ marginBottom: 0 }}>
          <button
            type="button"
            className={lang === 'de' ? undefined : 'secondary'}
            onClick={() => setLang('de')}
          >
            DE
          </button>
          <button
            type="button"
            className={lang === 'en' ? undefined : 'secondary'}
            onClick={() => setLang('en')}
          >
            EN
          </button>
        </div>
      </div>

      {step === 1 && (
        <div className="panel">
          <p className="muted">{t.intro1}</p>

          <label>
            {t.date}
            <div className="row">
              <a href={`/book?school=${location.code}&date=${addDaysToDateString(date, -1)}`}>
                <button type="button" className="secondary">
                  ←
                </button>
              </a>
              <input
                type="date"
                value={date}
                onChange={(e) => {
                  window.location.href = `/book?school=${location.code}&date=${e.target.value}`;
                }}
              />
              <a href={`/book?school=${location.code}&date=${addDaysToDateString(date, 1)}`}>
                <button type="button" className="secondary">
                  →
                </button>
              </a>
              {bookedSet.has(date) && <span className="badge">{t.busySlot}</span>}
            </div>
          </label>

          <div
            className="daybar"
            onClick={handleBarClick}
            role="button"
            tabIndex={0}
            aria-label={t.from}
          >
            {location.closingHour !== null && (
              <>
                <div
                  className="daybar__closed"
                  style={{
                    left: `${((location.closingHour * 60 - gridStartMin) / (gridEndMin - gridStartMin)) * 100}%`,
                    right: 0,
                  }}
                />
                {gridStartMin < 6 * 60 && (
                  <div
                    className="daybar__closed"
                    style={{ left: 0, width: `${((6 * 60 - gridStartMin) / (gridEndMin - gridStartMin)) * 100}%` }}
                  />
                )}
              </>
            )}
            {dayBlocks.map((b, i) => {
              const [bs, be] = clampToDayMinutes(b.startsAt, b.endsAt, date);
              const left = ((Math.max(bs, gridStartMin) - gridStartMin) / (gridEndMin - gridStartMin)) * 100;
              const width = ((Math.min(be, gridEndMin) - Math.max(bs, gridStartMin)) / (gridEndMin - gridStartMin)) * 100;
              if (width <= 0) return null;
              const clickable = b.kind === 'project' && (b.publicLink || b.publicDescription || b.publicTitle);
              return (
                <div
                  key={i}
                  className={`daybar__block daybar__block--${b.kind}`}
                  style={{ left: `${left}%`, width: `${width}%`, background: b.color ?? undefined, cursor: clickable ? 'pointer' : undefined }}
                  title={b.publicTitle ?? b.kind}
                  onClick={
                    clickable
                      ? (e) => {
                          e.stopPropagation();
                          if (b.publicLink && !b.publicDescription) {
                            window.open(b.publicLink, '_blank', 'noopener');
                          } else {
                            setActiveEvent(b);
                          }
                        }
                      : undefined
                  }
                />
              );
            })}
            <div
              className={`daybar__selection ${!timeOk ? 'daybar__selection--invalid' : ''}`}
              style={{
                left: `${((hhmmToMin(fromTime) - gridStartMin) / (gridEndMin - gridStartMin)) * 100}%`,
                width: `${((hhmmToMin(toTime) - hhmmToMin(fromTime)) / (gridEndMin - gridStartMin)) * 100}%`,
              }}
            />
          </div>
          <div className="daybar__hourmarks">
            <span>{minToHHMM(gridStartMin)}</span>
            <span>{minToHHMM(gridEndMin === 24 * 60 ? 23 * 60 + 59 : gridEndMin)}</span>
          </div>

          {activeEvent && (
            <div className="panel" style={{ marginTop: 8 }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <strong>{activeEvent.publicTitle ?? (lang === 'en' ? 'Event' : 'Veranstaltung')}</strong>
                <button type="button" className="secondary" onClick={() => setActiveEvent(null)}>
                  ×
                </button>
              </div>
              {activeEvent.publicDescription && <p style={{ marginBottom: 8 }}>{activeEvent.publicDescription}</p>}
              {activeEvent.publicLink && (
                <a href={activeEvent.publicLink} target="_blank" rel="noopener noreferrer">
                  {activeEvent.publicLink}
                </a>
              )}
            </div>
          )}

          <div className="daybar__legend">
            <span>
              <i style={{ background: 'var(--muted)' }} /> {t.busySlot}
            </span>
            <span>
              <i style={{ background: 'var(--accent-soft)', border: '2px solid var(--accent)' }} /> {t.freeSlot}
            </span>
          </div>

          <div className="grid-2" style={{ marginTop: 16 }}>
            <label>
              {t.from}
              <input type="time" value={fromTime} onChange={(e) => setFromTime(e.target.value)} step={900} />
            </label>
            <label>
              {t.to}
              <input type="time" value={toTime} onChange={(e) => setToTime(e.target.value)} step={900} />
            </label>
            <label>
              {t.persons}
              <input
                type="number"
                min={1}
                placeholder={t.phPersons}
                value={persons}
                onChange={(e) => setPersons(e.target.value)}
              />
            </label>
            <label>
              {t.type}
              <input
                type="text"
                placeholder={t.phType}
                value={eventType}
                onChange={(e) => setEventType(e.target.value)}
              />
            </label>
          </div>

          {allErrors.length > 0 && (
            <div className="notice">
              {allErrors.includes('overlap')
                ? t.overlapWarning
                : allErrors.includes('closing_violation')
                  ? t.lateBlocked
                  : allErrors.includes('too_soon')
                    ? t.shortTermWarning
                    : t.conflict}
              {allErrors.includes('overlap') && !showWaitlist && waitlistStatus !== 'success' && (
                <div style={{ marginTop: 10 }}>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setShowWaitlist(true)}
                  >
                    {t.waitlistBtn} →
                  </button>
                </div>
              )}
            </div>
          )}

          {showWaitlist && (
            <div className="panel" style={{ marginTop: 16, border: '1px solid var(--accent)' }}>
              <h3 style={{ marginTop: 0 }}>{t.waitlistTitle}</h3>
              <p className="muted small">{t.waitlistLead}</p>
              {waitlistStatus === 'success' ? (
                <div className="badge badge--ok" style={{ display: 'block', padding: 8, textAlign: 'center' }}>
                  {t.waitlistSuccess}
                </div>
              ) : (
                <>
                  <div className="grid-2">
                    <label>
                      {t.firstName} *
                      <input
                        type="text"
                        required
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                      />
                    </label>
                    <label>
                      {t.lastName} *
                      <input
                        type="text"
                        required
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                      />
                    </label>
                    <label>
                      {t.email} *
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </label>
                    <label>
                      {t.phone}
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                      />
                    </label>
                  </div>
                  <label>
                    {t.message}
                    <textarea
                      rows={2}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder={lang === 'en' ? 'Any flexible alternatives?' : 'Ggf. Ausweichtermine?'}
                    />
                  </label>
                  {waitlistError && <div className="notice">{waitlistError}</div>}
                  <div className="row" style={{ marginTop: 12 }}>
                    <button
                      type="button"
                      disabled={waitlistStatus === 'sending' || !firstName || !lastName || !email}
                      onClick={submitWaitlist}
                    >
                      {waitlistStatus === 'sending' ? t.btnSending : t.btnJoinWaitlist}
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => setShowWaitlist(false)}
                    >
                      {lang === 'en' ? 'Cancel' : 'Abbrechen'}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {tariffConfig && (tariffConfig.extras.length > 0 || tariffConfig.bikePricePerUnit != null) && (
            <>
              <h3>{t.extras}</h3>
              {tariffConfig.extras.map((x) =>
                x.type === 'quantity' ? (
                  <label key={x.id}>
                    {lang === 'en' ? x.labelEn : x.labelDe} ({x.pricePerUnit.toFixed(2)} €{' '}
                    {lang === 'en' ? 'each' : 'pro Einheit'})
                    <input
                      type="number"
                      min={x.min ?? 0}
                      max={x.max}
                      value={extraQuantities[x.id] ?? ''}
                      onChange={(e) => setExtraQuantities((prev) => ({ ...prev, [x.id]: e.target.value }))}
                    />
                  </label>
                ) : (
                  <label key={x.id} style={{ fontWeight: 400, color: 'var(--fg)', marginBottom: 4 }}>
                    <input
                      type="checkbox"
                      checked={extras.includes(x.id)}
                      onChange={() => toggleExtra(x.id)}
                      style={{ width: 'auto', display: 'inline', marginRight: 8 }}
                    />
                    {(lang === 'en' ? x.labelEn : x.labelDe)} ({x.price.toFixed(2)} €)
                  </label>
                ),
              )}
              {tariffConfig.bikePricePerUnit != null && (
                <label>
                  {t.bikesLabel}
                  <input
                    type="number"
                    min={0}
                    value={bikeCount}
                    onChange={(e) => setBikeCount(e.target.value)}
                  />
                </label>
              )}
            </>
          )}

          {tariffError && <div className="notice">{tariffError}</div>}

          {price && (
            <div className="panel" style={{ background: 'var(--accent-soft)', marginTop: 16 }}>
              <strong>{t.priceTitle}</strong>
              <table className="price-breakdown">
                <tbody>
                  {price.onRequest ? (
                    <tr>
                      <td colSpan={2}>{lang === 'en' ? 'Price on request' : 'Preis nach Vereinbarung'}</td>
                    </tr>
                  ) : (
                    <>
                      <tr>
                        <td>
                          {t.bdBase(price.tierHours ?? 0)}
                          {price.personsLabel ? ` · ${t.bdPersons(price.personsLabel)}` : ''}
                        </td>
                        <td>{((price.base ?? 0) + price.personsDelta).toFixed(2)} €</td>
                      </tr>
                      {price.timeSurcharge > 0 && (
                        <tr>
                          <td>{t.bdTime}</td>
                          <td>{price.timeSurcharge.toFixed(2)} €</td>
                        </tr>
                      )}
                      {price.extrasCost > 0 && (
                        <tr>
                          <td>
                            {t.bdExtras}: {price.extrasSelected.join(', ') || t.bdNoExtras}
                          </td>
                          <td>{price.extrasCost.toFixed(2)} €</td>
                        </tr>
                      )}
                      <tr>
                        <td>{t.bdTotal}</td>
                        <td>{(price.total ?? 0).toFixed(2)} €</td>
                      </tr>
                      {price.caution != null && price.caution > 0 && (
                        <tr>
                          <td>{lang === 'en' ? 'Deposit' : 'Kaution'}</td>
                          <td>{price.caution.toFixed(2)} €</td>
                        </tr>
                      )}
                    </>
                  )}
                </tbody>
              </table>
              <p className="muted small" style={{ marginBottom: 0 }}>
                {t.priceHint}
              </p>
            </div>
          )}

          <div className="row" style={{ marginTop: 16 }}>
            <button type="button" disabled={!canGoToContact} onClick={() => setStep(2)}>
              {t.btnNext}
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="panel">
          <div className="grid-2">
            <label>
              {t.salutation}
              <input type="text" value={salutation} onChange={(e) => setSalutation(e.target.value)} />
            </label>
            <label>
              {t.organization}
              <input type="text" value={organization} onChange={(e) => setOrganization(e.target.value)} />
            </label>
            <label>
              {t.firstName}
              <input type="text" required value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </label>
            <label>
              {t.lastName}
              <input type="text" required value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </label>
            <label>
              {t.street}
              <input
                type="text"
                required
                value={street}
                onChange={(e) => setStreet(e.target.value)}
                autoComplete="address-line1"
              />
            </label>
            <label>
              {t.house}
              <input
                type="text"
                required
                value={house}
                onChange={(e) => setHouse(e.target.value)}
                autoComplete="address-line2"
              />
            </label>
            <label>
              {t.zip}
              <input
                type="text"
                required
                value={zip}
                onChange={(e) => setZip(e.target.value)}
                autoComplete="postal-code"
              />
            </label>
            <label>
              {t.city}
              <input
                type="text"
                required
                value={city}
                onChange={(e) => setCity(e.target.value)}
                autoComplete="address-level2"
              />
            </label>
            <label>
              {t.email}
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label>
              {t.phone}
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </label>
          </div>
          <label>
            {t.message}
            <textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} />
          </label>

          <h3>{t.termsSummary}</h3>
          <ol style={{ paddingLeft: 20 }}>
            {getTermsForSchool(lang, location.code).map((term, i) => (
              <li key={i} style={{ marginBottom: 4 }}>
                {term}
              </li>
            ))}
          </ol>
          <label style={{ fontWeight: 400, color: 'var(--fg)' }}>
            <input
              type="checkbox"
              checked={accept}
              onChange={(e) => setAccept(e.target.checked)}
              style={{ width: 'auto', display: 'inline', marginRight: 8 }}
            />
            {t.accept}
          </label>

          {status === 'error' && submitError && <div className="notice">{submitError}</div>}

          <div className="row" style={{ marginTop: 16 }}>
            <button type="button" className="secondary" onClick={() => setStep(1)}>
              {t.btnBack}
            </button>
            <button
              type="button"
              disabled={!accept || !firstName || !lastName || !email || !street || !house || !zip || !city || status === 'sending'}
              onClick={submit}
            >
              {status === 'sending' ? t.btnSending : t.btnSend}
            </button>
          </div>
        </div>
      )}

      <p className="muted small">{t.introHint}</p>
    </div>
  );
}

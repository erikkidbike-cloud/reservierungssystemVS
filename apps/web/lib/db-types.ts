// Hand-written types mirroring supabase/migrations. Once the project exists,
// these can be replaced with `supabase gen types typescript`; until then this
// keeps the app type-safe against the schema as designed.

export type AppRole = 'admin' | 'location_manager' | 'staff' | 'finance' | 'hausmeister';

export type OnlineBookability = 'online' | 'phone_only' | 'offline';

export type TariffType = 'standard' | 'kita_schule' | 'nachweis';

export type BookingStatus =
  | 'requested'
  | 'approved'
  | 'agreement_sent'
  | 'signed'
  | 'paid'
  | 'confirmed'
  | 'completed'
  | 'rejected'
  | 'expired'
  | 'cancelled'
  | 'postponed';

export type BookingSource = 'public_form' | 'internal' | 'import';

export interface Location {
  id: string;
  code: string;
  name: string;
  short_name: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  online_bookability: OnlineBookability;
  closing_hour: number | null;
  hold_business_days: number;
  min_lead_days: number;
  min_duration_minutes: number;
  default_tap_minutes: number;
  grid_min_hour: number;
  grid_max_end_hour: number;
  cc_emails: string[];
  is_active: boolean;
  sort_order: number;
}

/** A category for special events — the `projects` table. Also used for the
 * long-running Frauenprojekt/Frauengefängnis blocks, so a "category" here is
 * really "a named, coloured group of blocks", public-event-specific or not. */
export interface ProjectRow {
  id: string;
  code: string;
  name: string;
  public_title: string | null;
  public_description: string | null;
  public_link: string | null;
  color: string | null;
  sort_order: number;
}

export type BlockKind = 'project' | 'maintenance' | 'training' | 'other';

/** A block: an internal closure, or — when is_public — a public "special event". */
export interface BlockRow {
  id: string;
  location_id: string;
  project_id: string | null;
  starts_at: string;
  ends_at: string;
  title: string | null;
  kind: BlockKind;
  is_public: boolean;
  public_title: string | null;
  public_link: string | null;
  color: string | null;
  public_description: string | null;
  created_by: string | null;
}

export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  role: AppRole;
  is_active: boolean;
}

/** Row of the public_availability view — deliberately contains no personal data. */
export interface AvailabilitySlot {
  location_code: string;
  starts_at: string;
  ends_at: string;
  kind: 'busy' | 'hold' | 'project';
  public_title: string | null;
  public_link: string | null;
}

/** Row of the bookings_staff view — no contact or financial columns. */
export interface StaffBooking {
  id: string;
  location_id: string;
  location_code: string;
  starts_at: string;
  ends_at: string;
  persons: number | null;
  event_type: string | null;
  status: BookingStatus;
}

/** Full booking row — only reachable by admin / location_manager / finance. */
export interface Booking extends StaffBooking {
  customer_id: string | null;
  tariff_type: TariffType;
  extras: unknown;
  bikes: unknown;
  needs_id_upload: boolean;
  price_total: number | null;
  price_breakdown: unknown;
  caution: number | null;
  currency: string;
  verwendungszweck: string | null;
  lang: string;
  source: BookingSource;
  hold_expires_at: string | null;
  message: string | null;
  internal_notes: string | null;
  created_at: string;
}

export interface Customer {
  id: string;
  salutation: string | null;
  first_name: string | null;
  last_name: string | null;
  organization: string | null;
  email: string | null;
  phone: string | null;
  street: string | null;
  house_number: string | null;
  zip: string | null;
  city: string | null;
  address_full: string | null;
  lang: string;
}

/** Row of agreement_clauses — the editable Nutzungsvereinbarung text. */
export interface AgreementClause {
  id: string;
  location_id: string;
  clause_key: string;
  sort_order: number;
  title_de: string;
  title_en: string;
  body_de: string;
  body_en: string;
  updated_by: string | null;
  updated_at: string;
}

export type TaskType = 'open_venue' | 'close_venue' | 'return_deposit' | 'send_agreement' | 'other';
export type TaskStatus = 'open' | 'done' | 'cancelled';

/** Row of `tasks`, for the admin/location_manager management view. */
export interface TaskRow {
  id: string;
  booking_id: string | null;
  location_id: string;
  type: TaskType;
  title: string | null;
  assignee_id: string | null;
  due_at: string | null;
  status: TaskStatus;
  done_at: string | null;
  notes: string | null;
}

/** Row of the `caretaker_tasks` view — a hausmeister's own tasks only. */
export interface CaretakerTaskRow {
  task_id: string;
  type: TaskType;
  title: string | null;
  due_at: string | null;
  status: TaskStatus;
  notes: string | null;
  starts_at: string | null;
  ends_at: string | null;
  location_code: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
}

export interface TariffRow {
  id: string;
  location_id: string;
  tariff_type: TariffType;
  config: unknown;
  valid_from: string;
  valid_to: string | null;
  is_active: boolean;
}

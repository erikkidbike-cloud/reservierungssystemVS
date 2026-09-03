// Shared German labels for the tasks screen (backlog 4.3/4.4), matching the
// pattern of booking-labels.ts so status/type names can't drift between the
// caretaker view and the manager view.

import type { TaskType, TaskStatus } from './db-types';

export const TASK_TYPE_LABEL: Record<TaskType, string> = {
  open_venue: 'Öffnen',
  close_venue: 'Schließen',
  return_deposit: 'Kaution zurückerstatten',
  send_agreement: 'Nutzungsvereinbarung versenden',
  other: 'Sonstiges',
};

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  open: 'Offen',
  done: 'Erledigt',
  cancelled: 'Storniert',
};

export function taskStatusBadgeClass(status: TaskStatus): string {
  if (status === 'done') return 'badge badge--ok';
  if (status === 'cancelled') return 'badge badge--warn';
  return 'badge';
}

/** Berlin-local date+time, or "—" for a task with no due date. */
export function fmtDue(iso: string | null): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('de-DE', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/Berlin',
  }).format(new Date(iso));
}

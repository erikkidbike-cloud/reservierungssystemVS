// Tasks (backlog 4.3, 4.4): auto-created by the database when a booking is
// confirmed (caretaker open/close) or completed with a deposit held
// (return_deposit) — see 0010_reference_and_tasks.sql. This page only shows
// and updates them; nothing here decides which tasks should exist.
//
// Two different views behind the same route, by role:
//   - hausmeister sees only their own tasks (the `caretaker_tasks` view, which
//     is already scoped to auth.uid() — see 0006_views.sql), with one action:
//     mark done.
//   - admin/location_manager see every task in their scope (RLS: `tasks_manage`,
//     0005_rls.sql, scopes location_manager to their own locations same as
//     everywhere else) and can reassign a caretaker or reopen a task.

import { cookies } from 'next/headers';
import { serverClient } from '@/lib/supabase';
import { getSessionUser, canSeeTasks, canApprove } from '@/lib/auth';
import type { CaretakerTaskRow, TaskRow } from '@/lib/db-types';
import { TASK_TYPE_LABEL, TASK_STATUS_LABEL, taskStatusBadgeClass, fmtDue } from '@/lib/task-labels';
import { markTaskDone, reopenTask, reassignTask } from './actions';

export const dynamic = 'force-dynamic';

interface ManageRow extends TaskRow {
  locations: { code: string; name: string } | null;
  profiles: { full_name: string | null; email: string | null } | null;
}

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter = 'open' } = await searchParams;
  const me = await getSessionUser();
  const role = me?.profile?.role;

  if (!canSeeTasks(role)) {
    return (
      <>
        <h1>Aufgaben</h1>
        <div className="notice">Für diese Rolle gibt es keine Aufgabenliste.</div>
      </>
    );
  }

  const supabase = serverClient(await cookies());

  if (role === 'hausmeister') {
    const { data, error } = await supabase
      .from('caretaker_tasks')
      .select('*')
      .order('status')
      .order('due_at');

    if (error) {
      return (
        <>
          <h1>Meine Aufgaben</h1>
          <div className="notice">Konnte Aufgaben nicht laden: {error.message}</div>
        </>
      );
    }

    const rows = (data ?? []) as CaretakerTaskRow[];
    const visible = filter === 'all' ? rows : rows.filter((r) => r.status === 'open');

    return (
      <>
        <h1>Meine Aufgaben</h1>
        <div className="row" style={{ margin: '16px 0' }}>
          <a href="/admin/tasks?filter=open">
            <span className={filter !== 'all' ? 'badge badge--ok' : 'badge'}>Offen</span>
          </a>
          <a href="/admin/tasks?filter=all">
            <span className={filter === 'all' ? 'badge badge--ok' : 'badge'}>Alle</span>
          </a>
        </div>

        {visible.length === 0 ? (
          <p className="muted">Keine offenen Aufgaben.</p>
        ) : (
          visible.map((t) => (
            <div key={t.task_id} className="panel">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <div>
                  <strong>{TASK_TYPE_LABEL[t.type]}</strong> · {t.location_code}
                  <span className={taskStatusBadgeClass(t.status)} style={{ marginLeft: 8 }}>
                    {TASK_STATUS_LABEL[t.status]}
                  </span>
                  <p className="muted small" style={{ margin: '4px 0 0' }}>
                    Fällig: {fmtDue(t.due_at)}
                  </p>
                  {(t.first_name || t.last_name) && (
                    <p className="muted small" style={{ margin: 0 }}>
                      {[t.first_name, t.last_name].filter(Boolean).join(' ')}
                      {t.phone ? ` · ${t.phone}` : ''}
                    </p>
                  )}
                  {t.notes && <p style={{ margin: '4px 0 0' }}>{t.notes}</p>}
                </div>
                {t.status === 'open' && (
                  <form action={markTaskDone}>
                    <input type="hidden" name="taskId" value={t.task_id} />
                    <button type="submit">Erledigt</button>
                  </form>
                )}
              </div>
            </div>
          ))
        )}
      </>
    );
  }

  // admin / location_manager -----------------------------------------------
  const [{ data, error }, { data: caretakerRows }] = await Promise.all([
    supabase
      .from('tasks')
      .select('*, locations(code, name), profiles(full_name, email)')
      .order('status')
      .order('due_at'),
    supabase
      .from('user_locations')
      .select('location_id, profiles!inner(id, full_name, email, role, is_active)')
      .eq('profiles.role', 'hausmeister')
      .eq('profiles.is_active', true),
  ]);

  if (error) {
    return (
      <>
        <h1>Aufgaben</h1>
        <div className="notice">Konnte Aufgaben nicht laden: {error.message}</div>
      </>
    );
  }

  const rows = (data ?? []) as ManageRow[];
  const visible = filter === 'all' ? rows : rows.filter((r) => r.status === 'open');

  // Which caretakers can be assigned at each location, for the reassign form.
  const caretakersByLocation = new Map<string, Array<{ id: string; label: string }>>();
  for (const r of (caretakerRows ?? []) as unknown as Array<{
    location_id: string;
    profiles: { id: string; full_name: string | null; email: string | null } | null;
  }>) {
    if (!r.profiles) continue;
    const list = caretakersByLocation.get(r.location_id) ?? [];
    list.push({ id: r.profiles.id, label: r.profiles.full_name || r.profiles.email || r.profiles.id });
    caretakersByLocation.set(r.location_id, list);
  }

  return (
    <>
      <h1>Aufgaben</h1>
      <div className="row" style={{ margin: '16px 0' }}>
        <a href="/admin/tasks?filter=open">
          <span className={filter !== 'all' ? 'badge badge--ok' : 'badge'}>Offen</span>
        </a>
        <a href="/admin/tasks?filter=all">
          <span className={filter === 'all' ? 'badge badge--ok' : 'badge'}>Alle</span>
        </a>
      </div>

      {visible.length === 0 ? (
        <p className="muted">Keine Aufgaben in dieser Ansicht.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Standort</th>
                <th>Art</th>
                <th>Fällig</th>
                <th>Status</th>
                <th>Zugewiesen</th>
                {canApprove(role) && <th />}
              </tr>
            </thead>
            <tbody>
              {visible.map((t) => {
                const options = t.locations
                  ? (caretakersByLocation.get(t.location_id) ?? [])
                  : [];
                return (
                  <tr key={t.id}>
                    <td>{t.locations?.code ?? '—'}</td>
                    <td>
                      {TASK_TYPE_LABEL[t.type]}
                      {t.notes && <div className="muted small">{t.notes}</div>}
                    </td>
                    <td>{fmtDue(t.due_at)}</td>
                    <td>
                      <span className={taskStatusBadgeClass(t.status)}>{TASK_STATUS_LABEL[t.status]}</span>
                    </td>
                    <td>
                      <form action={reassignTask} className="row" style={{ marginBottom: 0 }}>
                        <input type="hidden" name="taskId" value={t.id} />
                        <select name="assigneeId" defaultValue={t.assignee_id ?? ''}>
                          <option value="">Nicht zugewiesen</option>
                          {options.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                        <button type="submit" className="secondary">
                          Speichern
                        </button>
                      </form>
                    </td>
                    {canApprove(role) && (
                      <td>
                        <form action={t.status === 'done' ? reopenTask : markTaskDone}>
                          <input type="hidden" name="taskId" value={t.id} />
                          <button type="submit" className="secondary">
                            {t.status === 'done' ? 'Wiedereröffnen' : 'Erledigt'}
                          </button>
                        </form>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

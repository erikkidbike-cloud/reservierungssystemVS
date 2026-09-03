'use server';

// Saving a tariff config. Called directly from the client editor with a plain
// object (a Server Action doesn't have to take FormData — Next.js lets a
// client component call one like any async function) rather than through a
// <form>, because the shape here (nested arrays of tiers/extras) doesn't map
// cleanly onto flat form fields.
//
// parseTariffConfig() is the real gate: whatever the browser sent is
// re-validated exactly the way a value loaded from the database would be, so
// a bug in the editor UI can produce a rejected save, never a malformed
// config that silently mis-prices a booking. RLS (`tariffs_write`, admin
// only) is the actual access control — canManageTariffs() in the page only
// decides whether to render the editor at all.

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { serverClient } from '@/lib/supabase';
import { parseTariffConfig } from '@vs/pricing';

export interface SaveTariffResult {
  ok: boolean;
  error?: string;
}

export async function saveTariffConfig(tariffId: string, config: unknown): Promise<SaveTariffResult> {
  let validated;
  try {
    validated = parseTariffConfig(config);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

  const supabase = serverClient(await cookies());
  const { error } = await supabase.from('tariffs').update({ config: validated }).eq('id', tariffId);

  if (error) return { ok: false, error: error.message };

  revalidatePath('/admin/tariffs');
  return { ok: true };
}

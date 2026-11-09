import type { AppData } from '@/types';
import type { CooperativaCloudRevision } from '@/lib/performance/cooperadoEventDrivenSync';
import { fingerprintCooperativaCloudRevision } from '@/lib/performance/cooperadoEventDrivenSync';

const prefix = 'hb-staff-entry-verified-v1:';
type Proof = { digest: string; revision: string };
async function digest(data: AppData): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map(n => n.toString(16).padStart(2,'0')).join('');
}
/** Cached values only become visible after both content and current cloud revision match. */
export async function conferirEntradaStaffExistente(
  owner: string, data: () => AppData, readRevision: () => Promise<CooperativaCloudRevision | null>,
  store: Pick<Storage,'getItem'> | null,
): Promise<CooperativaCloudRevision | null> {
  if (!owner || !store) return null;
  try {
    const raw = store.getItem(prefix + owner);
    if (!raw) return null;
    const proof = JSON.parse(raw) as Proof;
    if (!proof.digest || proof.digest !== await digest(data())) return null;
    const revision = await readRevision();
    return revision && fingerprintCooperativaCloudRevision(revision) === proof.revision && proof.digest === await digest(data()) ? revision : null;
  } catch { return null; }
}
export async function registrarEntradaStaffConferida(owner: string, data: AppData, revision: CooperativaCloudRevision, store: Pick<Storage,'setItem'> | null): Promise<void> {
  if (!owner || !store) return;
  try { store.setItem(prefix + owner, JSON.stringify({ digest: await digest(data), revision: fingerprintCooperativaCloudRevision(revision) } satisfies Proof)); }
  catch { /* Cache acceleration is optional; never blocks a cloud-confirmed entry. */ }
}

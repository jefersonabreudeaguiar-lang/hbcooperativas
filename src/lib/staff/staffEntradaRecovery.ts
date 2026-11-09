/** Recovery copies live outside localStorage so an old photo cache cannot fill the entry buffer. */
export async function guardarCopiasEntradaStaff(cnpj: string, retired: Record<string, unknown[]>): Promise<void> {
  if (!Object.values(retired).some(rows => rows.length)) return;
  if (!/^\d{14}$/.test(cnpj)) throw new Error('Cooperativa inválida.');
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open('hb-staff-entry-recovery-v1', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('copies');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(new Error('Não foi possível guardar a cópia local de recuperação.'));
    req.onblocked = () => reject(new Error('Feche outras abas do aplicativo e tente novamente.'));
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('copies', 'readwrite');
      const store = tx.objectStore('copies');
      const req = store.get(cnpj);
      req.onsuccess = () => {
        const previous = (req.result ?? {}) as Record<string, Array<{ id: string }>>;
        for (const [domain, rows] of Object.entries(retired)) {
          previous[domain] = [...new Map([...(previous[domain] ?? []), ...rows as Array<{ id: string }>].map(r => [r.id, r])).values()];
        }
        store.put(previous, cnpj);
      };
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () => reject(new Error('Não foi possível guardar a cópia local de recuperação. Tente novamente.'));
    });
  } finally { db.close(); }
}

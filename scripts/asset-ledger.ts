// Upsert entries in brand/asset-sources.json (the provenance ledger) by id,
// keeping the existing order and appending new ids at the end.
import { readFile, writeFile } from 'node:fs/promises';
export interface LedgerEntry {
  id: string;
  localPath: string;
  sourceUrl: string | null;
  author: string;
  usageBasis: 'owned' | 'licensed' | 'generated';
  licenseNote: string;
  depictsProductId: string | null;
  isIllustrative: boolean;
  sha256: string;
}
export async function upsertLedger(entries: LedgerEntry[], extra: Record<string, unknown> = {}) {
  const ledger = JSON.parse(await readFile('brand/asset-sources.json', 'utf8'));
  for (const entry of entries) {
    const i = ledger.assets.findIndex((a: LedgerEntry) => a.id === entry.id);
    if (i >= 0) ledger.assets[i] = entry;
    else ledger.assets.push(entry);
  }
  Object.assign(ledger, extra);
  await writeFile('brand/asset-sources.json', JSON.stringify(ledger, null, 2) + '\n');
}

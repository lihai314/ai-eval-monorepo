/** Dataset CRUD for the management UI (P3). All writes go through the BFF
 *  with an authenticated session; this layer only speaks SQL. */
import postgres from "postgres";
import { getSql } from "./runs";

export interface DatasetSummary {
  id: string;
  name: string;
  version: number;
  source: string;
  items: number;
  createdAt: string;
}

export interface DatasetItem {
  id: string;
  input: Record<string, unknown>;
  expected: Record<string, unknown> | null;
  provenance: string;
  createdAt: string;
}

export interface DatasetDetail {
  id: string;
  name: string;
  version: number;
  source: string;
  createdAt: string;
  items: DatasetItem[];
}

export async function getDatasetsSummary(): Promise<DatasetSummary[]> {
  const rows = await getSql()`
    select d.id, d.name, d.version, d.source, d.created_at,
      (select count(*) from dataset_items i where i.dataset_id = d.id)::int as items
    from datasets d order by d.created_at desc`;
  return rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    version: Number(r.version),
    source: String(r.source),
    items: Number(r.items),
    createdAt: String(r.created_at),
  }));
}

export async function getDatasetDetail(id: string): Promise<DatasetDetail | null> {
  const [d] = await getSql()`
    select id, name, version, source, created_at from datasets where id = ${id}`;
  if (!d) return null;
  const items = await getSql()`
    select id, input, expected, provenance, created_at
    from dataset_items where dataset_id = ${id} order by created_at`;
  return {
    id: String(d.id),
    name: String(d.name),
    version: Number(d.version),
    source: String(d.source),
    createdAt: String(d.created_at),
    items: items.map((i) => ({
      id: String(i.id),
      input: i.input as Record<string, unknown>,
      expected: (i.expected as Record<string, unknown>) ?? null,
      provenance: String(i.provenance),
      createdAt: String(i.created_at),
    })),
  };
}

export async function createDataset(name: string): Promise<{ id: string }> {
  const [row] = await getSql()`
    insert into datasets (name, version, source) values (${name}, 1, 'manual')
    returning id`;
  if (!row) throw new Error(`dataset '${name}' already exists`);
  return { id: String(row.id) };
}

export async function addItem(
  datasetId: string,
  input: Record<string, unknown>,
  expected: Record<string, unknown> | null,
): Promise<{ id: string }> {
  const [row] = await getSql()`
    insert into dataset_items (dataset_id, input, expected, provenance)
    values (${datasetId}, ${input as unknown as postgres.Parameter}, ${expected as unknown as postgres.Parameter}, 'manual') returning id`;
  if (!row) throw new Error("failed to insert item");
  return { id: String(row.id) };
}

/** Human correction of ground truth — flips provenance so the P5 flywheel
 *  can distinguish curated values from raw seeds. */
export async function updateItemExpected(
  itemId: string,
  expected: Record<string, unknown> | null,
): Promise<void> {
  await getSql()`
    update dataset_items set expected = ${expected as unknown as postgres.Parameter}, provenance = 'corrected'
    where id = ${itemId}`;
}

export async function deleteItem(itemId: string): Promise<void> {
  await getSql()`delete from dataset_items where id = ${itemId}`;
}

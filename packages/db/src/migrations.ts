/** Pure helpers for migration drift detection (repo files vs remote ledger). */

export function migrationVersionsFromFiles(filenames: readonly string[]): string[] {
  return filenames
    .map((f) => /^(\d+)_.+\.sql$/.exec(f)?.[1])
    .filter((v): v is string => v !== undefined)
    .sort();
}

export interface MigrationDiff {
  onlyInRepo: string[];
  onlyInRemote: string[];
  clean: boolean;
}

export function diffMigrations(repo: readonly string[], remote: readonly string[]): MigrationDiff {
  const r = new Set(repo);
  const m = new Set(remote);
  const onlyInRepo = repo.filter((v) => !m.has(v)).sort();
  const onlyInRemote = remote.filter((v) => !r.has(v)).sort();
  return { onlyInRepo, onlyInRemote, clean: onlyInRepo.length === 0 && onlyInRemote.length === 0 };
}

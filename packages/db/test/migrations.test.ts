import { describe, expect, it } from "vitest";
import { diffMigrations, migrationVersionsFromFiles } from "../src/migrations";

describe("migrationVersionsFromFiles", () => {
  it("extracts and sorts version prefixes", () => {
    expect(migrationVersionsFromFiles(["0002_x.sql", "0001_eval_core.sql", "README.md"])).toEqual([
      "0001",
      "0002",
    ]);
  });
});

describe("diffMigrations", () => {
  it("clean when sets match", () => {
    expect(diffMigrations(["0001"], ["0001"]).clean).toBe(true);
  });

  it("detects unapplied repo migrations", () => {
    const d = diffMigrations(["0001", "0002"], ["0001"]);
    expect(d.onlyInRepo).toEqual(["0002"]);
    expect(d.clean).toBe(false);
  });

  it("detects dashboard-side drift (remote-only versions)", () => {
    const d = diffMigrations(["0001"], ["0001", "0099"]);
    expect(d.onlyInRemote).toEqual(["0099"]);
    expect(d.clean).toBe(false);
  });
});

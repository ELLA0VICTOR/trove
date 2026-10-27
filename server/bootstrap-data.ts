import { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Database } from "./database.ts";

/** Carry private price caches and cumulative usage into a hosted installation. */
export async function seedHostedData(database: Database, directory: string) {
  const sources = [
    {
      file: resolve(directory, "local.sqlite"),
      tables: ["market_snapshots", "market_refresh", "coach_usage"],
    },
    { file: resolve(directory, "coach-usage.sqlite"), tables: ["coach_usage"] },
  ];
  const records: { table: string; rows: Record<string, unknown>[] }[] = [];
  for (const source of sources) {
    if (!existsSync(source.file)) continue;
    const local = new DatabaseSync(source.file, { readOnly: true });
    try {
      local.exec("BEGIN");
      for (const table of source.tables) {
        if (
          !local
            .prepare(
              "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
            )
            .get(table)
        )
          continue;
        records.push({
          table,
          rows: local.prepare(`SELECT * FROM ${table}`).all(),
        });
      }
      local.exec("COMMIT");
    } finally {
      local.close();
    }
  }
  const counts: Record<string, number> = {};
  await database.transaction(async () => {
    await database.lock("host-bootstrap");
    for (const { table, rows } of records)
      for (const row of rows) {
        const columns = Object.keys(row);
        if (columns.some((name) => !/^\w+$/.test(name)))
          throw new Error("Unexpected local column identity.");
        let sql = `INSERT INTO ${table}(${columns.join(",")}) VALUES(${columns.map(() => "?").join(",")})`;
        sql +=
          table === "coach_usage"
            ? " ON CONFLICT(id) DO UPDATE SET estimated_nano=CASE WHEN coach_usage.estimated_nano<excluded.estimated_nano THEN excluded.estimated_nano ELSE coach_usage.estimated_nano END"
            : " ON CONFLICT DO NOTHING";
        const result = await database
          .prepare(sql)
          .run(...columns.map((column) => row[column]));
        counts[table] = (counts[table] ?? 0) + Number(result.changes);
      }
  });
  return counts;
}

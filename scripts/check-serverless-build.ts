import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

// Vercel reads the root tsconfig; it does not follow Vite's project references.
// Exercise emitted JavaScript without tsx or Node's TypeScript source loader.
mkdirSync(".artifacts", { recursive: true });
const directory = mkdtempSync(resolve(".artifacts/serverless-build-"));
const output = join(directory, "output");
const config = join(directory, "tsconfig.json");
writeFileSync(
  config,
  JSON.stringify({
    extends: resolve("tsconfig.json"),
    compilerOptions: {
      noEmit: false,
      noCheck: true,
      declaration: false,
      incremental: false,
      composite: false,
      rootDir: resolve("."),
      outDir: output,
    },
    files: [resolve("api/index.ts")],
    include: [],
    exclude: [],
  }),
);
const compiler = spawnSync(
  process.execPath,
  [createRequire(import.meta.url).resolve("typescript/bin/tsc"), "-p", config],
  {
    encoding: "utf8",
    windowsHide: true,
  },
);
assert.equal(compiler.status, 0, compiler.stdout + compiler.stderr);
let modules = 0;
function inspect(directory: string) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) inspect(file);
    else if (entry.name.endsWith(".js")) {
      modules++;
      assert.doesNotMatch(
        readFileSync(file, "utf8"),
        /(?:from\s*|import\s*\()\s*["']\.{1,2}\/[^"']*\.(?:ts|tsx)["']/,
        `TypeScript import remained in ${file}`,
      );
    }
  }
}
inspect(output);
writeFileSync(
  join(output, "check.mjs"),
  `
import assert from 'node:assert/strict';
import entry from './api/index.js';
import {createServerlessHandler} from './server/serverless.js';
import {createRuntime} from './server/runtime.js';
import {Database} from './server/database.js';
assert.equal(typeof entry.fetch, 'function');
const work=[];
const handler=createServerlessHandler({
  runtime:()=>createRuntime({database:new Database({filename:':memory:'}),serverless:true}),
  origin:'https://compiled.trove.example',
  defer:p=>work.push(p),
});
try {
  const health=await handler.fetch(new Request('https://compiled.trove.example/api/index?__trove_health=1'));
  assert.equal(health.status,200);
  assert.deepEqual(await health.json(),{status:'ok'});
  const state=await handler.fetch(new Request('https://compiled.trove.example/api/index?__trove_path=state'));
  assert.equal(state.status,200);
  assert.ok((await state.json()).instruments.length>0);
} finally { await Promise.all(work); await handler.close(); }
`,
);
const check = spawnSync(process.execPath, [join(output, "check.mjs")], {
  env: {
    ...process.env,
    NODE_OPTIONS: "",
    TROVE_LIVE_SERVICES: "0",
    DATABASE_URL: "",
  },
  encoding: "utf8",
  windowsHide: true,
});
assert.equal(check.status, 0, check.stdout + check.stderr);
console.log(
  JSON.stringify(
    {
      emittedModules: modules,
      checks: [
        "JavaScript import extensions",
        "native Node entry import",
        "compiled health route",
        "compiled state route",
      ],
      providerCalls: 0,
    },
    null,
    2,
  ),
);

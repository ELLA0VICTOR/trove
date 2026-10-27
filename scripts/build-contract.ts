import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const local = resolve(".artifacts/toolchain/sui.exe");
const executable = process.env.SUI_CLI ?? (existsSync(local) ? local : "sui");
function run(args: string[]) {
  const result = spawnSync(executable, args, {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    windowsHide: true,
  });
  const stdout = result.stdout ?? "",
    stderr = result.stderr ?? "";
  const safe = (text: string) =>
    text
      .split(/\r?\n/)
      .filter(
        (line) => !/secret recovery phrase|private key|mnemonic/i.test(line),
      )
      .join("\n");
  if (result.error)
    throw new Error(
      "Install Sui testnet-v1.82.2 or set SUI_CLI to the local executable path.",
    );
  if (result.status !== 0)
    throw new Error(safe(stderr + "\n" + stdout).slice(-6000));
  return { stdout, stderr: safe(stderr) };
}
const tests = run(["move", "test", "--path", "contracts/practice"]);
// Keep compiler-generated Git dependency paths portable between Windows and Linux.
const lockPath = "contracts/practice/Move.lock";
function normalizeLock() {
  if (existsSync(lockPath))
    writeFileSync(
      lockPath,
      readFileSync(lockPath, "utf8").replace(
        /subdir = '([^']+)'/g,
        (_, path: string) => `subdir = '${path.replaceAll("\\", "/")}'`,
      ),
    );
}
console.log(
  tests.stdout
    .split(/\r?\n/)
    .filter((line) => /PASS|FAIL|Test result/.test(line))
    .join("\n"),
);
if (!process.argv.includes("--test-only")) {
  const result = run([
    "move",
    "build",
    "--path",
    "contracts/practice",
    "--dump-bytecode-as-base64",
  ]);
  const start = result.stdout.indexOf('{"modules":');
  if (start < 0)
    throw new Error("The compiler did not return a bytecode package.");
  const data = JSON.parse(result.stdout.slice(start));
  mkdirSync(".artifacts/contracts", { recursive: true });
  writeFileSync(".artifacts/contracts/build.json", JSON.stringify(data));
  console.log(
    `Built ${data.modules.length} Move module(s). No publication was requested.`,
  );
}
normalizeLock();

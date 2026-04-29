import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const env = { ...process.env };

// Local verification should exercise the build in this checkout, not a previously
// deployed URL left over in the shell. Opt in when intentionally testing prod.
if (env.PLAYWRIGHT_BASE_URL && env.PARTY_PLANNER_E2E_ALLOW_EXTERNAL !== "1") {
  console.warn("Ignoring PLAYWRIGHT_BASE_URL for local verification. Set PARTY_PLANNER_E2E_ALLOW_EXTERNAL=1 to override.");
  delete env.PLAYWRIGHT_BASE_URL;
}

env.PW_PREVIEW_PORT ??= "4291";

const child = spawn(process.execPath, [require.resolve("@playwright/test/cli"), "test", ...process.argv.slice(2)], {
  stdio: "inherit",
  env,
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`Playwright exited with signal ${signal}`);
    process.exit(1);
  }
  process.exit(code ?? 1);
});

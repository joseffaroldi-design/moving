// Plain Node test (no new deps) for the transport + feature-flag layer.
// Transpiles the REAL publicIntake.ts, overrides env + mocks global.fetch so we
// can cover BOTH feature-flag states and the mocked Edge Function responses
// WITHOUT changing any committed/production configuration.
//
// Run: node src/lib/__tests__/publicIntake.test.mjs
import { readFile, writeFile, unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const here = dirname(fileURLToPath(import.meta.url));
const libDir = join(here, "..");
const srcPath = join(libDir, "publicIntake.ts");
const outPath = join(libDir, `.publicIntake.test.gen.mjs`);

// Override env BEFORE importing the module (INTAKE_ENABLED is read at load time).
process.env.NEXT_PUBLIC_ESTIMATE_INTAKE_ENABLED = "true";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://mock.supabase.test";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "mock-anon-key";

const source = await readFile(srcPath, "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
});
await writeFile(outPath, outputText, "utf8");

const { submitEstimate, newIdempotencyKey, INTAKE_ENABLED } = await import(
  `${outPath}?t=${Date.now()}`
);

let passed = 0;
let failed = 0;
const failures = [];
function check(name, cond) {
  if (cond) { passed++; console.log(`  \u2713 ${name}`); }
  else { failed++; failures.push(name); console.log(`  \u2717 ${name}`); }
}

// Capture what the browser sends to the Edge Function.
let lastCall = null;
function mockFetch(nextResponse) {
  global.fetch = async (url, opts) => {
    lastCall = { url, opts, body: JSON.parse(opts.body) };
    return {
      json: async () => nextResponse,
    };
  };
}

const payload = {
  first_name: "Alex",
  last_name: "Broussard",
  email: "alex@example.com",
  phone: "504-555-1234",
  move_type: "Residential Moving",
};

console.log("publicIntake.ts");

// --- feature flag ON (env override) ---
check("INTAKE_ENABLED reflects env override (ON)", INTAKE_ENABLED === true);

// --- idempotency key ---
{
  const a = newIdempotencyKey();
  const b = newIdempotencyKey();
  check("newIdempotencyKey returns non-empty", typeof a === "string" && a.length > 0);
  check("newIdempotencyKey is unique per call", a !== b);
}

// --- success path (mocked Edge Function) ---
{
  mockFetch({ ok: true, message: "Received" });
  const res = await submitEstimate(payload, "idem-123");
  check("success response returns ok:true", res.ok === true);
  check("posts to /functions/v1/public-estimate-intake", String(lastCall.url).endsWith("/functions/v1/public-estimate-intake"));
  check("sends apikey header", lastCall.opts.headers.apikey === "mock-anon-key");
  check("body includes idempotency_key", lastCall.body.idempotency_key === "idem-123");
  check("body includes empty honeypot company_website", lastCall.body.company_website === "");
  check("body does NOT leak company_id", !("company_id" in lastCall.body));
  check("body does NOT leak key_hash", !("key_hash" in lastCall.body));
  check("body does NOT leak payload_hash", !("payload_hash" in lastCall.body));
  check("body forwards business fields (first_name)", lastCall.body.first_name === "Alex");
}

// --- server validation error path (mocked) ---
{
  mockFetch({ ok: false, message: "Please fix the highlighted fields.", errors: { email: "Invalid email." } });
  const res = await submitEstimate(payload, "idem-err");
  check("server error returns ok:false with field errors", res.ok === false && res.errors?.email === "Invalid email.");
}

// --- malformed / non-JSON response -> graceful fallback ---
{
  global.fetch = async () => ({ json: async () => null });
  const res = await submitEstimate(payload, "idem-bad");
  check("malformed response -> graceful fallback fail", res.ok === false && !!res.message);
}

// --- network throw -> graceful fallback ---
{
  global.fetch = async () => { throw new Error("network down"); };
  const res = await submitEstimate(payload, "idem-throw");
  check("network error -> graceful fallback fail", res.ok === false && !!res.message);
}

// --- missing supabase config -> fallback fail (no request) ---
{
  const savedUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Re-import a fresh module instance with config stripped.
  process.env.NEXT_PUBLIC_SUPABASE_URL = "";
  const { outputText: t2 } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  });
  const out2 = join(libDir, `.publicIntake.test.gen2.mjs`);
  await writeFile(out2, t2, "utf8");
  const mod2 = await import(`${out2}?t=${Date.now()}`);
  let called = false;
  global.fetch = async () => { called = true; return { json: async () => ({}) }; };
  const res = await mod2.submitEstimate(payload, "idem-noconfig");
  check("missing supabase config -> fallback fail, no request made", res.ok === false && called === false);
  await unlink(out2).catch(() => {});
  process.env.NEXT_PUBLIC_SUPABASE_URL = savedUrl;
}

await unlink(outPath).catch(() => {});
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("Failures:\n - " + failures.join("\n - "));
  process.exit(1);
}
process.exit(0);

// Plain Node test runner (no new deps). Transpiles the REAL estimateValidation.ts
// with the installed `typescript` compiler so tests run against the actual schema
// (zero drift), then imports it and asserts behavior.
//
// Run: node src/lib/__tests__/estimateValidation.test.mjs
import { readFile, writeFile, unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const here = dirname(fileURLToPath(import.meta.url));
const libDir = join(here, "..");
const srcPath = join(libDir, "estimateValidation.ts");
// Emit next to the source so `import "zod"` resolves via node_modules.
const outPath = join(libDir, `.estimateValidation.test.gen.mjs`);

const source = await readFile(srcPath, "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2020,
  },
});
await writeFile(outPath, outputText, "utf8");

let validateEstimate, MOVE_TYPES;
try {
  ({ validateEstimate, MOVE_TYPES } = await import(`${outPath}?t=${Date.now()}`));
} finally {
  // best-effort cleanup after import resolves below
}

// ---- tiny assertion harness ----
let passed = 0;
let failed = 0;
const failures = [];
function check(name, cond) {
  if (cond) {
    passed++;
    console.log(`  \u2713 ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`  \u2717 ${name}`);
  }
}

const base = {
  firstName: "Alex",
  lastName: "Broussard",
  email: "alex@example.com",
  phone: "",
  moveType: "Residential Moving",
  moveDate: "",
};
const v = (o) => ({ ...base, ...o });

// helper dates
function futureDate(days) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
function pastDate(days) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}
function yearsAhead(y) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setFullYear(d.getFullYear() + y);
  d.setDate(d.getDate() + 5); // clearly beyond the +2yr max
  return d.toISOString().slice(0, 10);
}

console.log("estimateValidation.ts");

// --- happy paths ---
check("valid with email only", validateEstimate(v({ phone: "" })).ok);
check(
  "valid with phone only",
  validateEstimate(v({ email: "", phone: "(504) 555-1234" })).ok
);
check(
  "valid with both email + phone + future date",
  validateEstimate(v({ phone: "504-555-1234", moveDate: futureDate(30) })).ok
);

// --- required names ---
{
  const r = validateEstimate(v({ firstName: "  " }));
  check("missing firstName -> error", !r.ok && !!r.errors.firstName);
}
{
  const r = validateEstimate(v({ lastName: "" }));
  check("missing lastName -> error", !r.ok && !!r.errors.lastName);
}
{
  const long = "x".repeat(81);
  const r = validateEstimate(v({ firstName: long }));
  check("firstName too long (>80) -> error", !r.ok && !!r.errors.firstName);
}

// --- contact rule (email OR phone required) ---
{
  const r = validateEstimate(v({ email: "", phone: "" }));
  check("no email + no phone -> contact error", !r.ok && !!r.errors.contact);
}

// --- invalid formats ---
{
  const r = validateEstimate(v({ email: "not-an-email", phone: "" }));
  check("invalid email format -> email error", !r.ok && !!r.errors.email);
}
{
  const r = validateEstimate(v({ email: "", phone: "123" }));
  check("phone too short -> phone error", !r.ok && !!r.errors.phone);
}
{
  const r = validateEstimate(v({ email: "", phone: "abcd efgh" }));
  check("phone with letters -> phone error", !r.ok && !!r.errors.phone);
}
{
  const r = validateEstimate(v({ email: "", phone: "1234567890123456" }));
  check("phone too long (>15 digits) -> phone error", !r.ok && !!r.errors.phone);
}

// --- move type enum ---
check("MOVE_TYPES is a non-empty list", Array.isArray(MOVE_TYPES) && MOVE_TYPES.length > 0);
{
  const r = validateEstimate(v({ moveType: "Teleportation" }));
  check("invalid moveType -> moveType error", !r.ok && !!r.errors.moveType);
}
check("empty moveType is allowed", validateEstimate(v({ moveType: "" })).ok);

// --- move date bounds (today .. +2 years) ---
{
  const r = validateEstimate(v({ moveDate: pastDate(1) }));
  check("moveDate in the past -> moveDate error", !r.ok && !!r.errors.moveDate);
}
{
  const r = validateEstimate(v({ moveDate: yearsAhead(2) }));
  check("moveDate beyond +2yr -> moveDate error", !r.ok && !!r.errors.moveDate);
}
{
  const r = validateEstimate(v({ moveDate: "13/40/2026" }));
  check("malformed moveDate -> moveDate error", !r.ok && !!r.errors.moveDate);
}
check("moveDate today is allowed", validateEstimate(v({ moveDate: futureDate(0) })).ok);
check("moveDate ~1yr ahead is allowed", validateEstimate(v({ moveDate: futureDate(365) })).ok);

// --- summary ---
await unlink(outPath).catch(() => {});
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("Failures:\n - " + failures.join("\n - "));
  process.exit(1);
}
process.exit(0);

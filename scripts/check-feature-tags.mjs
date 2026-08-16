/**
 * Does every OpenRouter call still carry a feature tag?
 *
 * The tag (OpenRouter's `user` field) is what splits spend below the API key
 * on the dashboard. Getting it wrong has NO symptom: the answer still
 * streams, the translation still lands, tests still pass — the money just
 * falls quietly into the `unmapped` bucket and nobody notices for a quarter.
 * That is what this guards, because nothing else can.
 *
 * It checks both directions, which is the point:
 *
 *   1. every call site passes `feature`                    (nothing untagged)
 *   2. every literal it passes is a key in FEATURE_TAGS    (nothing mistyped)
 *   3. every key in FEATURE_TAGS is claimed by a call site (nothing dead)
 *   4. both request builders really send `user` — including the STREAMING
 *      one, which is the easiest to forget and usually the most expensive
 *   5. nobody hand-rolls a request to the completions endpoint outside
 *      packages/llm, which would bypass the shared client entirely
 *
 * Rule 1 has one legitimate exception: a wrapper that forwards its own
 * caller's feature (translate → createOpenRouterProvider → chatComplete).
 * That's allowed only in a file that itself defines a tracked entry point,
 * so the forwarded value is checked at the wrapper's own call sites. A new
 * route doing `chatComplete({ feature: someVar })` is NOT a wrapper and
 * fails here.
 *
 * Plain Node + the TypeScript compiler API (already a dependency) — no test
 * runner in this repo, and nothing here needs a DB or a key.
 *
 *   npm run check:feature-tags
 */
import ts from "typescript";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FEATURES_FILE = "packages/llm/src/features.ts";
const CLIENT_FILE = "packages/llm/src/openrouter.ts";

/** Where source lives. Everything else (node_modules, .next, build output) is skipped. */
const SCAN_DIRS = [
  "apps/spechub/src",
  "apps/spechub/scripts",
  "apps/engenie/src",
  "packages/llm/src",
  "packages/db/src",
  "packages/auth/src",
];

/**
 * Functions that reach OpenRouter and therefore must carry a feature,
 * keyed by the module they're imported from. Matching on the import (not
 * just the name) keeps unrelated `translate(...)` calls out of the results.
 */
const TRACKED = [
  { module: /^@eg\/llm\/openrouter$/, names: ["chatComplete", "streamComplete"] },
  { module: /(^|\/)lib\/translate$/, names: ["translate"] },
  { module: /(^|\/)providers\/openrouter$/, names: ["createOpenRouterProvider"] },
];
const ENTRY_NAMES = new Set(TRACKED.flatMap((t) => t.names));

/** Second and third segment shape, as documented in features.ts. */
const TAG_RE = /^engenius-spechub\.(engenie|dsgen)\.[a-z0-9]+(-[a-z0-9]+)*$/;
const UNMAPPED_RE = /^engenius-spechub\.unmapped$/;

const problems = [];
const fail = (where, msg) => problems.push(`${where}: ${msg}`);

// ── Read the table ──────────────────────────────────────────────────────────

function parse(relPath) {
  const abs = join(ROOT, relPath);
  return ts.createSourceFile(abs, readFileSync(abs, "utf8"), ts.ScriptTarget.Latest, true);
}

function readTable() {
  const sf = parse(FEATURES_FILE);
  const tags = new Map();
  const union = new Set();
  let unmapped = null;

  const visit = (node) => {
    if (ts.isTypeAliasDeclaration(node) && node.name.text === "Feature") {
      const members = ts.isUnionTypeNode(node.type) ? node.type.types : [node.type];
      for (const m of members) {
        if (ts.isLiteralTypeNode(m) && ts.isStringLiteral(m.literal)) union.add(m.literal.text);
      }
    }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      if (node.name.text === "FEATURE_TAGS" && node.initializer && ts.isObjectLiteralExpression(node.initializer)) {
        for (const p of node.initializer.properties) {
          if (!ts.isPropertyAssignment(p)) continue;
          const key = ts.isIdentifier(p.name) || ts.isStringLiteral(p.name) ? p.name.text : null;
          if (key && ts.isStringLiteral(p.initializer)) tags.set(key, p.initializer.text);
        }
      }
      if (node.name.text === "UNMAPPED_TAG" && node.initializer && ts.isStringLiteral(node.initializer)) {
        unmapped = node.initializer.text;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return { tags, union, unmapped };
}

const { tags, union, unmapped } = readTable();

if (tags.size === 0) fail(FEATURES_FILE, "FEATURE_TAGS is empty or unreadable — this checker cannot see the table");
if (unmapped === null) fail(FEATURES_FILE, "UNMAPPED_TAG not found");
else if (!UNMAPPED_RE.test(unmapped)) fail(FEATURES_FILE, `UNMAPPED_TAG "${unmapped}" should be engenius-spechub.unmapped`);

for (const [key, tag] of tags) {
  if (!TAG_RE.test(tag)) fail(FEATURES_FILE, `tag "${tag}" (${key}) must be <project>.<tool>.<feature>, lowercase ASCII`);
  if (!union.has(key)) fail(FEATURES_FILE, `"${key}" is in FEATURE_TAGS but missing from the Feature union`);
}
for (const key of union) {
  if (!tags.has(key)) fail(FEATURES_FILE, `Feature "${key}" has no entry in FEATURE_TAGS`);
}
const seenTags = new Set(tags.values());
if (seenTags.size !== tags.size) fail(FEATURES_FILE, "two features share one tag — spend would be merged");

// ── Walk the source ─────────────────────────────────────────────────────────

function* sourceFiles() {
  for (const dir of SCAN_DIRS) {
    const abs = join(ROOT, dir);
    let root;
    try {
      root = statSync(abs);
    } catch {
      fail(dir, "scan directory does not exist — SCAN_DIRS is stale, coverage is not what it claims");
      continue;
    }
    if (!root.isDirectory()) continue;
    const stack = [abs];
    while (stack.length) {
      const cur = stack.pop();
      for (const entry of readdirSync(cur, { withFileTypes: true })) {
        const p = join(cur, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === "node_modules" || entry.name === ".next") continue;
          stack.push(p);
        } else if (/\.tsx?$/.test(entry.name)) {
          yield p;
        }
      }
    }
  }
}

/** Local name → tracked entry name, for the imports this file actually has. */
function trackedImports(sf) {
  const map = new Map();
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue;
    const spec = st.moduleSpecifier.text;
    const match = TRACKED.find((t) => t.module.test(spec));
    if (!match) continue;
    const bindings = st.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const el of bindings.elements) {
      const original = (el.propertyName ?? el.name).text;
      if (match.names.includes(original)) map.set(el.name.text, original);
    }
  }
  return map;
}

/** Does this file define one of the tracked entry points? Then it may forward. */
function definesEntryPoint(sf) {
  let found = false;
  const visit = (node) => {
    if (found) return;
    if (ts.isFunctionDeclaration(node) && node.name && ENTRY_NAMES.has(node.name.text)) found = true;
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && ENTRY_NAMES.has(node.name.text)) found = true;
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

const callSites = [];
let filesScanned = 0;

for (const abs of sourceFiles()) {
  const rel = relative(ROOT, abs);
  const sf = ts.createSourceFile(abs, readFileSync(abs, "utf8"), ts.ScriptTarget.Latest, true);
  filesScanned++;

  const imports = trackedImports(sf);
  if (imports.size === 0) continue;
  const mayForward = definesEntryPoint(sf);

  const visit = (node) => {
    // Bare-identifier calls only: `provider.translate(a, b)` is a method on
    // the returned provider, not an entry point, and takes no options object.
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && imports.has(node.expression.text)) {
      const fn = imports.get(node.expression.text);
      const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
      const where = `${rel}:${line}`;
      const arg = node.arguments[0];

      if (!arg || !ts.isObjectLiteralExpression(arg)) {
        fail(where, `${fn}() must be called with an options object carrying \`feature\``);
      } else {
        const prop = arg.properties.find(
          (p) =>
            (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) &&
            (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) &&
            p.name.text === "feature",
        );
        if (!prop) {
          fail(where, `${fn}() is missing \`feature\` — this spend would land in ${unmapped}`);
        } else if (ts.isPropertyAssignment(prop) && ts.isStringLiteral(prop.initializer)) {
          const key = prop.initializer.text;
          if (!tags.has(key)) {
            fail(where, `feature "${key}" is not in FEATURE_TAGS (${FEATURES_FILE})`);
          }
          callSites.push({ where, fn, key });
        } else if (mayForward) {
          // A wrapper passing its own caller's feature through. Its callers
          // are checked by rule 1, so the value is pinned down there.
          callSites.push({ where, fn, key: null });
        } else {
          fail(
            where,
            `${fn}() passes a non-literal \`feature\`, but this file defines no entry point to forward from — ` +
              `pass a literal from FEATURE_TAGS instead`,
          );
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

// ── The shared client must send `user` on BOTH request builders ─────────────

{
  const sf = parse(CLIENT_FILE);
  let builders = 0;
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "fetch" &&
      node.arguments[0] &&
      ts.isIdentifier(node.arguments[0]) &&
      node.arguments[0].text === "OPENROUTER_ENDPOINT"
    ) {
      builders++;
      const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
      const where = `${CLIENT_FILE}:${line}`;
      const init = node.arguments[1];
      const bodyProp =
        init && ts.isObjectLiteralExpression(init)
          ? init.properties.find(
              (p) => ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === "body",
            )
          : null;
      const payload =
        bodyProp && ts.isCallExpression(bodyProp.initializer) ? bodyProp.initializer.arguments[0] : null;

      const userProp =
        payload && ts.isObjectLiteralExpression(payload)
          ? payload.properties.find(
              (p) => ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === "user",
            )
          : null;

      if (!userProp) {
        fail(where, "request body has no `user` field — these calls would be untagged");
      } else if (
        !ts.isCallExpression(userProp.initializer) ||
        !ts.isIdentifier(userProp.initializer.expression) ||
        userProp.initializer.expression.text !== "featureTag"
      ) {
        // Guards the nastiest possible slip: ChatOptions.user is the PROMPT.
        fail(where, "`user` must be featureTag(opts.feature) — anything else risks shipping prompt text as the tag");
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  if (builders < 2) {
    fail(CLIENT_FILE, `found ${builders} request builder(s), expected at least 2 (chatComplete + streamComplete)`);
  }
}

// ── Nobody bypasses the shared client ──────────────────────────────────────

for (const abs of sourceFiles()) {
  const rel = relative(ROOT, abs);
  if (rel.startsWith("packages/llm/")) continue;
  const text = readFileSync(abs, "utf8");
  if (text.includes("openrouter.ai/api/v1/chat/completions") || text.includes("OPENROUTER_ENDPOINT")) {
    fail(rel, "talks to the OpenRouter completions endpoint directly — use chatComplete/streamComplete so it gets tagged");
  }
}

// ── Every tag must be claimed ──────────────────────────────────────────────

const used = new Set(callSites.filter((c) => c.key).map((c) => c.key));
for (const key of tags.keys()) {
  if (!used.has(key)) {
    fail(FEATURES_FILE, `feature "${key}" (${tags.get(key)}) has no call site — remove it, or the dashboard shows a row that can never appear`);
  }
}

// ── Prove the scan actually saw something (pitfall #69) ────────────────────

if (filesScanned < 50) fail("scan", `only ${filesScanned} files scanned — the walk is broken, a pass here means nothing`);
if (callSites.length === 0) fail("scan", "no call sites found at all — the import matching is broken, a pass here means nothing");

// ── Report ────────────────────────────────────────────────────────────────

if (problems.length) {
  console.error("✗ feature tag check failed\n");
  for (const p of problems) console.error(`  ${p}`);
  console.error(`\n  The table lives in ${FEATURES_FILE}.`);
  process.exit(1);
}

console.log(`✓ feature tags — ${filesScanned} files, ${callSites.length} call sites, ${tags.size} tags, all matched\n`);
const byKey = new Map();
for (const c of callSites) {
  const label = c.key ? tags.get(c.key) : "(forwarded)";
  if (!byKey.has(label)) byKey.set(label, []);
  byKey.get(label).push(`${c.where} ${c.fn}()`);
}
for (const [label, sites] of [...byKey].sort()) {
  console.log(`  ${label}`);
  for (const s of sites) console.log(`      ${s}`);
}

/**
 * Does every Supabase write look at its `error`?
 *
 * supabase-js resolves either way and never throws, so a failed write is
 * invisible unless somebody reads the field: the route answers 200, the toast
 * says "Saved", and the row is not there. That is pitfall #45, and it has
 * shipped four separate times — a `versions` insert that violated a unique
 * constraint, a `products` update that wrote `null` into a NOT NULL column
 * and silently dropped the rest of the statement with it, a
 * `product_translations` insert whose foreign key never matched (so locale
 * hardware images were never once recorded), and `applyItems` reporting
 * success after its rules update failed.
 *
 * Nothing else catches this. Types can't: `{ data, error }` is a perfectly
 * good value to discard. Tests can't: the write succeeds in every environment
 * anyone tests in. Review didn't, for two years.
 *
 * A write counts as checked when ANY of these is true:
 *
 *   1. it goes through `throwIfDbError(...)` or `logIfDbError(...)`
 *   2. its result is destructured with `error` (`const { error } = await …`)
 *   3. its result lands in a variable that is later passed to one of those
 *      helpers, or has `.error` read off it
 *   4. the line above carries `// db-write-unchecked: <why>` — for the rare
 *      write whose failure genuinely does not matter, stated out loud
 *
 *   npm run check:db-writes
 */
import ts from "typescript";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const SCAN_DIRS = [
  "apps/spechub/src",
  "apps/engenie/src",
  "packages/db/src",
  "packages/auth/src",
  "packages/llm/src",
];

/** Query-builder terminators that write. `select` is a read and is not here. */
const WRITE_METHODS = new Set(["insert", "update", "upsert", "delete"]);
/** Storage terminators that write. */
const STORAGE_WRITE_METHODS = new Set(["upload", "remove", "copy", "move", "createSignedUploadUrl"]);
/**
 * `rpc` is included because three of ours mutate (auth_rate_check,
 * api_key_touch, ask_workspace_touch) and the read-only ones are cheap to
 * annotate.
 */
const RPC_METHOD = "rpc";

const OPT_OUT = /db-write-unchecked:/;
const HELPERS = new Set(["throwIfDbError", "logIfDbError"]);

const problems = [];

function walkDir(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === "node_modules" || name === ".next") continue;
      walkDir(full, out);
    } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

/** Is `node` a call like `<something>.from("x")....` (a supabase chain)? */
function chainTouchesFrom(node) {
  let cur = node;
  let depth = 0;
  while (cur && depth++ < 12) {
    if (ts.isCallExpression(cur)) {
      const e = cur.expression;
      if (ts.isPropertyAccessExpression(e) && e.name.text === "from") return true;
      cur = ts.isPropertyAccessExpression(e) ? e.expression : e;
      continue;
    }
    if (ts.isPropertyAccessExpression(cur)) {
      if (cur.name.text === "from") return true;
      cur = cur.expression;
      continue;
    }
    break;
  }
  return false;
}

/** Does the chain start from something that looks like a supabase client? */
function looksLikeClient(node) {
  let cur = node;
  let depth = 0;
  while (cur && depth++ < 14) {
    if (ts.isIdentifier(cur)) return /supabase|admin|client|db/i.test(cur.text);
    if (ts.isCallExpression(cur)) {
      const e = cur.expression;
      if (ts.isIdentifier(e) && /createAdminClient|createClient/.test(e.text)) return true;
      cur = e;
      continue;
    }
    if (ts.isPropertyAccessExpression(cur)) {
      cur = cur.expression;
      continue;
    }
    if (ts.isAwaitExpression(cur) || ts.isParenthesizedExpression(cur)) {
      cur = cur.expression;
      continue;
    }
    break;
  }
  return false;
}

/** Find the enclosing function body, to scope the "used later" search. */
function enclosingBody(node) {
  let cur = node.parent;
  while (cur) {
    if (
      ts.isFunctionDeclaration(cur) ||
      ts.isFunctionExpression(cur) ||
      ts.isArrowFunction(cur) ||
      ts.isMethodDeclaration(cur) ||
      ts.isSourceFile(cur)
    ) {
      return cur;
    }
    cur = cur.parent;
  }
  return null;
}

/** `await x` / `x` / `(await x) as T`, where x is `name`. */
function isAwaitOf(node, name) {
  let cur = node;
  let d = 0;
  while (cur && d++ < 4) {
    if (ts.isIdentifier(cur)) return cur.text === name;
    if (ts.isAwaitExpression(cur) || ts.isParenthesizedExpression(cur) || ts.isAsExpression(cur)) {
      cur = cur.expression;
      continue;
    }
    return false;
  }
  return false;
}

function identifierIsChecked(name, scope) {
  let checked = false;
  const visit = (n) => {
    if (checked) return;
    // `<name>.error`
    if (ts.isPropertyAccessExpression(n) && n.name.text === "error" && ts.isIdentifier(n.expression) && n.expression.text === name) {
      checked = true;
      return;
    }
    // `throwIfDbError("…")(<name>)`
    if (ts.isCallExpression(n) && n.arguments.some((a) => ts.isIdentifier(a) && a.text === name)) {
      const callee = n.expression;
      const head =
        ts.isCallExpression(callee) && ts.isIdentifier(callee.expression) ? callee.expression.text
        : ts.isIdentifier(callee) ? callee.text
        : null;
      if (head && HELPERS.has(head)) {
        checked = true;
        return;
      }
    }
    // const { error } = await <name>  — the builder was stored, then awaited.
    if (
      ts.isVariableDeclaration(n) &&
      ts.isObjectBindingPattern(n.name) &&
      n.initializer &&
      isAwaitOf(n.initializer, name) &&
      n.name.elements.some((el) => (el.propertyName ?? el.name).getText() === "error")
    ) {
      checked = true;
      return;
    }
    ts.forEachChild(n, visit);
  };
  ts.forEachChild(scope, visit);
  return checked;
}

/** Walk outward from the call to decide whether anyone looks at the error. */
function isChecked(call, sf) {
  let node = call;
  // Generous: a builder chain plus `await` plus an `as {...}` assertion is
  // already eight hops before the destructuring that checks the error.
  let hops = 0;
  while (node.parent && hops++ < 20) {
    const p = node.parent;

    // Wrapped: throwIfDbError("…")(await …) / logIfDbError("…", await …)
    if (ts.isCallExpression(p)) {
      const callee = p.expression;
      const head =
        ts.isCallExpression(callee) && ts.isIdentifier(callee.expression) ? callee.expression.text
        : ts.isIdentifier(callee) ? callee.text
        : null;
      if (head && HELPERS.has(head)) return true;
    }

    // const { error } = await …   /   const { data, error } = …
    if (ts.isVariableDeclaration(p) && ts.isObjectBindingPattern(p.name)) {
      const names = p.name.elements.map((el) =>
        ts.isIdentifier(el.propertyName ?? el.name) ? (el.propertyName ?? el.name).text : "",
      );
      if (names.includes("error")) return true;
      // Destructured without `error` — the error is being dropped.
      return false;
    }

    // const res = await …  → is `res` inspected later?
    if (ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) {
      const scope = enclosingBody(p) ?? sf;
      return identifierIsChecked(p.name.text, scope);
    }

    // return await … — the caller owns it.
    if (ts.isReturnStatement(p)) return true;
    // `if ((await …).error)`, `… && …`, `… ? … : …` — the value is being read.
    // Only in the CONDITION, never the body: an enclosing `if (x.length > 0)`
    // says nothing about the write inside it, and treating it as a check is
    // how this guard first reported "all clear" over four writes that
    // discard their result (its own version of pitfall #69).
    if (ts.isIfStatement(p) && p.expression === node) return true;
    if (ts.isConditionalExpression(p) && p.condition === node) return true;
    if (ts.isBinaryExpression(p)) return true;

    // The value reached a statement boundary without anyone taking it.
    if (ts.isExpressionStatement(p)) return false;

    node = p;
  }
  return false;
}

function hasOptOut(sf, pos) {
  const { line } = sf.getLineAndCharacterOfPosition(pos);
  const lines = sf.getFullText().split("\n");
  for (let i = Math.max(0, line - 3); i <= line; i++) {
    if (lines[i] && OPT_OUT.test(lines[i])) return true;
  }
  return false;
}

for (const dir of SCAN_DIRS) {
  const abs = join(ROOT, dir);
  let files;
  try {
    files = walkDir(abs);
  } catch {
    continue;
  }

  for (const file of files) {
    const text = readFileSync(file, "utf8");
    if (!/\.(insert|update|upsert|delete|upload|remove|rpc)\(/.test(text)) continue;
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

    const visit = (node) => {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        const method = node.expression.name.text;
        const recv = node.expression.expression;

        const isQueryWrite = WRITE_METHODS.has(method) && chainTouchesFrom(recv);
        const isStorageWrite = STORAGE_WRITE_METHODS.has(method) && chainTouchesFrom(recv) && /storage/i.test(recv.getText());
        const isRpc = method === RPC_METHOD && looksLikeClient(recv);

        if ((isQueryWrite || isStorageWrite || isRpc) && !isChecked(node, sf) && !hasOptOut(sf, node.getStart())) {
          const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
          problems.push(`${relative(ROOT, file)}:${line + 1}  .${method}() result is discarded`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
}

if (problems.length) {
  console.error(`\n✗ ${problems.length} Supabase write(s) with an unread error:\n`);
  for (const p of problems.sort()) console.error(`  ${p}`);
  console.error(
    `\nWrap the result: throwIfDbError("<table> <op>")(await supabase…) from @eg/db/errors,\n` +
      `or logIfDbError("…", res) when the loop must carry on, or — if the failure\n` +
      `really is not worth knowing about — say so with  // db-write-unchecked: <why>\n`,
  );
  process.exit(1);
}

console.log("✓ every Supabase write result is checked");

/**
 * supabase-js does not throw.
 *
 * Every write returns `{ data, error }` and resolves either way, so an
 * ignored `error` is invisible: the function returns, the route answers 200,
 * the toast says "Saved". This is the oldest recurring bug in this codebase
 * (pitfall #45) and it has landed at least four separate times —
 *
 *   · a `versions` insert that violated a unique constraint, leaving
 *     `products.current_versions` claiming a PDF that was never written;
 *   · a `products` update writing `null` into a `NOT NULL DEFAULT ''`
 *     column, which dropped the OTHER columns in the same statement and
 *     reported the clear as a success (pitfall #60);
 *   · a `product_translations` insert whose foreign key never matched, so
 *     locale hardware images have never once been recorded;
 *   · `applyItems` reporting `applied: 4` after the rules update failed.
 *
 * None of them produced an error anywhere. Hence the convention: pass every
 * write result through here, and let `npm run check:db-writes` fail the
 * build when a new one forgets.
 */

/** The shape every supabase-js write resolves to. */
export interface DbResult {
  error: { message?: string; code?: string; details?: string | null } | null;
}

/** Thrown when a write reported an error. Carries the Postgres code. */
export class DbWriteError extends Error {
  readonly code: string | undefined;
  readonly details: string | null | undefined;

  constructor(label: string, error: NonNullable<DbResult["error"]>) {
    super(
      `${label} failed: ${error.message ?? "unknown error"}` +
        (error.code ? ` (code=${error.code})` : ""),
    );
    this.name = "DbWriteError";
    this.code = error.code;
    this.details = error.details;
  }
}

/**
 * Throw if a write failed; otherwise hand the result straight back, so it can
 * wrap an await in place:
 *
 *   const { data } = throwIfDbError("versions insert")(
 *     await supabase.from("versions").insert(row).select("id").single(),
 *   );
 *
 * `label` should name the table and the operation — it is what a person sees
 * in the log at 2am, with no stack frame worth reading above it.
 */
export function throwIfDbError(label: string) {
  return <T extends DbResult>(res: T): T => {
    if (res.error) throw new DbWriteError(label, res.error);
    return res;
  };
}

/**
 * The same check for a write whose failure must not abort the caller — a
 * per-row loop that should keep going, a best-effort cleanup. It logs instead
 * of throwing, and returns whether the write landed, so the caller can count
 * failures and report them rather than finishing quietly.
 *
 * This exists so that "keep going" is a decision someone wrote down, rather
 * than the accident of leaving `error` unread.
 */
export function logIfDbError(label: string, res: DbResult): boolean {
  if (!res.error) return true;
  console.error(`[db] ${new DbWriteError(label, res.error).message}`);
  return false;
}

import { createAdminClient } from "@eg/db/admin";

export interface RpcResult<T> {
  data: T | null;
  error: { message?: string } | null;
}

/**
 * Call a Postgres function the generated DB types don't know about yet
 * (the ask_analytics_* family, migration 00060). Service role only — these
 * read what people typed into Ask.
 */
export async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<RpcResult<T>> {
  const client = createAdminClient() as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<RpcResult<T>>;
  };
  return await client.rpc(fn, args);
}

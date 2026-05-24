import type { SupabaseClient } from "@supabase/supabase-js";
import { getServerSupabase as typedClient } from "@gaia/db/server";

// Until `pnpm --filter @gaia/db types:generate` runs against a live Supabase
// stack, the Database type in @gaia/db/types is a permissive placeholder that
// narrows table inserts/updates to `never` under Supabase 2.x's generic
// inference. Routes call getDb() to get an untyped client and skip the
// problem. Once types are generated, swap this cast for the typed client.
export function getDb(): SupabaseClient {
  return typedClient() as unknown as SupabaseClient;
}

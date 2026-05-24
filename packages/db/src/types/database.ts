// Generated types placeholder.
//
// Run `pnpm --filter @gaia/db types:generate` to replace this file with
// `supabase gen types typescript --local` output. Until the local Supabase
// stack is running this stub gives consumers a typed-but-unconstrained
// surface so the package can compile in CI.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: Record<string, { Row: Record<string, unknown>; Insert: Record<string, unknown>; Update: Record<string, unknown> }>;
    Views: Record<string, { Row: Record<string, unknown> }>;
    Functions: Record<string, { Args: Record<string, unknown>; Returns: unknown }>;
    Enums: Record<string, string>;
    CompositeTypes: Record<string, Record<string, unknown>>;
  };
}

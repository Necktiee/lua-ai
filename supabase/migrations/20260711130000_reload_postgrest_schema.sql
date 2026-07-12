-- Ensure PostgREST exposes Phase 4+ columns/RPC signatures after migrations.
notify pgrst, 'reload schema';

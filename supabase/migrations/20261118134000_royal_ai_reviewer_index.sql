-- Non-destructive index for Royal AI reviewer filtering and FK checks.
-- Unrelated L&A Team database indexes are intentionally not modified here.
CREATE INDEX IF NOT EXISTS royal_ai_opportunities_reviewed_by_idx
  ON public.royal_ai_opportunities (reviewed_by);

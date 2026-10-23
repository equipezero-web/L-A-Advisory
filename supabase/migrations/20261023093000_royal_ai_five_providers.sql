BEGIN;

INSERT INTO public.royal_ai_providers
  (provider_key, display_name, priority, enabled, free_only)
VALUES
  ('gemini', 'Google Gemini', 10, true, true),
  ('groq', 'Groq', 20, true, true),
  ('openrouter', 'OpenRouter Free', 30, true, true),
  ('cloudflare', 'Cloudflare Workers AI', 40, true, true),
  ('cohere', 'Cohere Trial', 50, true, true)
ON CONFLICT (provider_key) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  priority = EXCLUDED.priority,
  enabled = EXCLUDED.enabled,
  free_only = true,
  updated_at = now();

-- Local AI remains reserved for a future self-hosted worker and is not part
-- of the five cloud-provider fallback chain yet.
UPDATE public.royal_ai_providers
SET enabled = false,
    priority = 90,
    updated_at = now()
WHERE provider_key = 'local';

COMMIT;

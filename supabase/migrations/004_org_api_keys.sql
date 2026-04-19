-- ── Organisation API Keys ──
-- Stores customer-provided API keys for AI model access.
-- Free/trial users must bring their own keys (BYOK).
-- Paid plans (starter/pro/advanced) use CMO.ie's managed keys.

ALTER TABLE public.organisations
  ADD COLUMN anthropic_api_key TEXT,
  ADD COLUMN openai_api_key TEXT,
  ADD COLUMN google_api_key TEXT,
  ADD COLUMN perplexity_api_key TEXT;

-- Comment for clarity
COMMENT ON COLUMN public.organisations.anthropic_api_key IS 'Customer-provided Anthropic API key (BYOK for free/trial)';
COMMENT ON COLUMN public.organisations.openai_api_key IS 'Customer-provided OpenAI API key (BYOK for free/trial)';
COMMENT ON COLUMN public.organisations.google_api_key IS 'Customer-provided Google AI API key (BYOK for free/trial)';
COMMENT ON COLUMN public.organisations.perplexity_api_key IS 'Customer-provided Perplexity API key (BYOK for free/trial)';

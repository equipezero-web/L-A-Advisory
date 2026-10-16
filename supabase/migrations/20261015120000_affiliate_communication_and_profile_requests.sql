-- Private affiliate communication and profile-change approval workflow.
-- All reads/writes are performed by trusted Edge Functions using service role.
BEGIN;

CREATE TABLE IF NOT EXISTS public.affiliate_profile_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id text NOT NULL REFERENCES public.affiliates(id) ON DELETE CASCADE,
  proposed_changes jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  admin_note text,
  CONSTRAINT affiliate_profile_change_requests_changes_object
    CHECK (jsonb_typeof(proposed_changes) = 'object')
);

CREATE INDEX IF NOT EXISTS affiliate_profile_change_requests_pending_idx
  ON public.affiliate_profile_change_requests (status, requested_at DESC);

CREATE INDEX IF NOT EXISTS affiliate_profile_change_requests_affiliate_idx
  ON public.affiliate_profile_change_requests (affiliate_id, requested_at DESC);

CREATE TABLE IF NOT EXISTS public.affiliate_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id text NOT NULL REFERENCES public.affiliates(id) ON DELETE CASCADE,
  sender_role text NOT NULL CHECK (sender_role IN ('affiliate', 'admin')),
  sender_user_id text,
  message text NOT NULL CHECK (char_length(btrim(message)) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);

CREATE INDEX IF NOT EXISTS affiliate_messages_conversation_idx
  ON public.affiliate_messages (affiliate_id, created_at ASC);

CREATE INDEX IF NOT EXISTS affiliate_messages_unread_idx
  ON public.affiliate_messages (affiliate_id, sender_role, read_at)
  WHERE read_at IS NULL;

ALTER TABLE public.affiliate_profile_change_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_messages ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.affiliate_profile_change_requests FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.affiliate_messages FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.affiliate_profile_change_requests TO service_role;
GRANT ALL ON TABLE public.affiliate_messages TO service_role;

COMMENT ON TABLE public.affiliate_profile_change_requests IS
  'Solicitações de alteração de dados de afiliados aguardando aprovação administrativa.';
COMMENT ON TABLE public.affiliate_messages IS
  'Mensagens privadas entre afiliados e administradores da L&A Royal Advisory.';

COMMIT;

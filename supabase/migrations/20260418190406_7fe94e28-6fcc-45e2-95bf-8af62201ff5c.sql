-- Tabela de passkeys (WebAuthn) por usuário
CREATE TABLE public.user_passkeys (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL UNIQUE,
  public_key TEXT NOT NULL,
  counter BIGINT NOT NULL DEFAULT 0,
  device_label TEXT,
  transports TEXT[],
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_used_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_user_passkeys_user_id ON public.user_passkeys(user_id);
CREATE INDEX idx_user_passkeys_credential_id ON public.user_passkeys(credential_id);

ALTER TABLE public.user_passkeys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own passkeys"
ON public.user_passkeys FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own passkeys"
ON public.user_passkeys FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own passkeys"
ON public.user_passkeys FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own passkeys"
ON public.user_passkeys FOR DELETE
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all passkeys"
ON public.user_passkeys FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));
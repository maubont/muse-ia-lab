-- Idempotencia del webhook: Twilio reintenta webhooks; un MessageSid solo puede
-- producir UNA fila en musa_messages (la función además repite el eco sin insertar).
create unique index musa_messages_twilio_sid_uq
  on public.musa_messages (twilio_sid)
  where twilio_sid is not null;

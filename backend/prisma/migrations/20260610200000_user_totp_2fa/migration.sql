-- ============ 2FA TOTP (opt-in por usuario) ============
-- Verificacao em duas etapas no login: depois da senha, o user com
-- totpAtivo=true precisa do codigo de 6 digitos do app autenticador.
-- totpSecret e gravado no setup (QR exibido) mas o gate so vale apos a
-- ativacao provar um codigo valido. Aditiva e segura para re-execucao.

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "totpSecret" TEXT,
  ADD COLUMN IF NOT EXISTS "totpAtivo" BOOLEAN NOT NULL DEFAULT false;

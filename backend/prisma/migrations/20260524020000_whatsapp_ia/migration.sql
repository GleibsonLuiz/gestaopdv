-- ETAPA#9b: WhatsApp + IA Claude

CREATE TABLE "whatsapp_settings" (
  "id"              TEXT PRIMARY KEY,
  "instanceName"    TEXT NOT NULL,
  "instanceToken"   TEXT NOT NULL,
  "webhookSecret"   TEXT,
  "aiSystemPrompt"  TEXT,
  "isActive"        BOOLEAN NOT NULL DEFAULT false,
  "statusConexao"   TEXT,
  "qrCodeUltimo"    TEXT,
  "createdAt"       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP NOT NULL,
  "tenantId"        TEXT NOT NULL
);
CREATE UNIQUE INDEX "whatsapp_settings_tenantId_key" ON "whatsapp_settings" ("tenantId");
ALTER TABLE "whatsapp_settings" ADD CONSTRAINT "whatsapp_settings_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "empresas" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "whatsapp_logs" (
  "id"          TEXT PRIMARY KEY,
  "numero"      TEXT NOT NULL,
  "nomeContato" TEXT,
  "mensagem"    TEXT NOT NULL,
  "resposta"    TEXT,
  "sucesso"     BOOLEAN NOT NULL DEFAULT true,
  "erro"        TEXT,
  "duracaoMs"   INTEGER,
  "createdAt"   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "settingsId"  TEXT NOT NULL,
  "tenantId"    TEXT NOT NULL
);
CREATE INDEX "whatsapp_logs_tenantId_createdAt_idx" ON "whatsapp_logs" ("tenantId", "createdAt");
CREATE INDEX "whatsapp_logs_tenantId_numero_idx" ON "whatsapp_logs" ("tenantId", "numero");
ALTER TABLE "whatsapp_logs" ADD CONSTRAINT "whatsapp_logs_settingsId_fkey"
  FOREIGN KEY ("settingsId") REFERENCES "whatsapp_settings" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "whatsapp_logs" ADD CONSTRAINT "whatsapp_logs_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "empresas" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- destinoTenantId=null -> notificacao broadcast (todos os tenants).
-- Setado -> mensagem direcionada so pros users daquele tenant.
-- Todas as notificacoes existentes ficam como broadcast (col nullable).
ALTER TABLE "notificacoes" ADD COLUMN "destinoTenantId" TEXT;

CREATE INDEX "notificacoes_destinoTenantId_idx" ON "notificacoes"("destinoTenantId");

ALTER TABLE "notificacoes" ADD CONSTRAINT "notificacoes_destinoTenantId_fkey"
  FOREIGN KEY ("destinoTenantId") REFERENCES "empresas"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

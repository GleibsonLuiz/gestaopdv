-- Novo enum: TipoComanda. Toda comanda existente fica MESA por default
-- (mantem o comportamento anterior — nao havia tipos antes).
CREATE TYPE "TipoComanda" AS ENUM ('MESA', 'VIAGEM', 'DELIVERY');

ALTER TABLE "comandas"
  ADD COLUMN "tipo" "TipoComanda" NOT NULL DEFAULT 'MESA';

-- Novos status: PRONTO (saiu da cozinha), SERVINDO (cliente consumindo
-- na mesa), EM_ENTREGA (entregador saiu). Adicionados ao enum existente.
ALTER TYPE "StatusComanda" ADD VALUE 'PRONTO';
ALTER TYPE "StatusComanda" ADD VALUE 'SERVINDO';
ALTER TYPE "StatusComanda" ADD VALUE 'EM_ENTREGA';

-- Timestamps por transicao — preservam histograma do ciclo de vida.
ALTER TABLE "comandas"
  ADD COLUMN "prontoEm"    TIMESTAMP(3),
  ADD COLUMN "servindoEm"  TIMESTAMP(3),
  ADD COLUMN "emEntregaEm" TIMESTAMP(3);

-- Campos para DELIVERY/VIAGEM (endereco + entregador + telefone).
ALTER TABLE "comandas"
  ADD COLUMN "enderecoEntrega" TEXT,
  ADD COLUMN "entregadorNome"  TEXT,
  ADD COLUMN "telefoneContato" TEXT;

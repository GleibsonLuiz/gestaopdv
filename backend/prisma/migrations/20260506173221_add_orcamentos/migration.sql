-- CreateEnum
CREATE TYPE "TipoOrcamento" AS ENUM ('ORCAMENTO', 'ORDEM_SERVICO');

-- CreateEnum
CREATE TYPE "StatusOrcamento" AS ENUM ('RASCUNHO', 'AGUARDANDO_APROVACAO', 'APROVADO', 'REJEITADO', 'ENTREGUE', 'CANCELADO');

-- CreateEnum
CREATE TYPE "TabelaPreco" AS ENUM ('AV', 'PZ', 'AT');

-- CreateTable
CREATE TABLE "orcamentos" (
    "id" TEXT NOT NULL,
    "numero" SERIAL NOT NULL,
    "tipo" "TipoOrcamento" NOT NULL DEFAULT 'ORCAMENTO',
    "status" "StatusOrcamento" NOT NULL DEFAULT 'RASCUNHO',
    "tabelaPreco" "TabelaPreco" NOT NULL DEFAULT 'AV',
    "clienteId" TEXT,
    "descricaoCliente" TEXT,
    "contato" TEXT,
    "telefone" TEXT,
    "via" INTEGER NOT NULL DEFAULT 1,
    "observacoes" TEXT,
    "imprimirObservacoes" BOOLEAN NOT NULL DEFAULT true,
    "rodape" TEXT,
    "mostrarValorMetro" BOOLEAN NOT NULL DEFAULT false,
    "imprimirValores" BOOLEAN NOT NULL DEFAULT true,
    "valorProdutos" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "valorServicos" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "deslocamento" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "desconto" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "formaCondicaoPagamento" TEXT,
    "dataAprovacao" TIMESTAMP(3),
    "dataEntrega" TIMESTAMP(3),
    "dataRejeicao" TIMESTAMP(3),
    "motivoRejeicao" TEXT,
    "dataCancelamento" TIMESTAMP(3),
    "motivoCancelamento" TEXT,
    "userId" TEXT NOT NULL,
    "responsavelId" TEXT,
    "vendaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orcamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "itens_orcamento" (
    "id" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "quantidade" DECIMAL(10,3) NOT NULL,
    "valorUnitario" DECIMAL(10,4) NOT NULL,
    "largura" DECIMAL(10,3),
    "altura" DECIMAL(10,3),
    "totalEm" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "acertoTotal" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(10,2) NOT NULL,
    "formato" TEXT,
    "vias" TEXT,
    "cores" TEXT,
    "complemento" TEXT,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "orcamentoId" TEXT NOT NULL,

    CONSTRAINT "itens_orcamento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "orcamentos_numero_key" ON "orcamentos"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "orcamentos_vendaId_key" ON "orcamentos"("vendaId");

-- CreateIndex
CREATE INDEX "orcamentos_clienteId_idx" ON "orcamentos"("clienteId");

-- CreateIndex
CREATE INDEX "orcamentos_status_idx" ON "orcamentos"("status");

-- CreateIndex
CREATE INDEX "orcamentos_tipo_status_idx" ON "orcamentos"("tipo", "status");

-- CreateIndex
CREATE INDEX "itens_orcamento_orcamentoId_ordem_idx" ON "itens_orcamento"("orcamentoId", "ordem");

-- AddForeignKey
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_vendaId_fkey" FOREIGN KEY ("vendaId") REFERENCES "vendas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens_orcamento" ADD CONSTRAINT "itens_orcamento_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens_orcamento" ADD CONSTRAINT "itens_orcamento_orcamentoId_fkey" FOREIGN KEY ("orcamentoId") REFERENCES "orcamentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

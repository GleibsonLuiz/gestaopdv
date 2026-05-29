-- Preparacao para emissao de documento fiscal eletronico (NFC-e / NF-e).
-- SCHEMA-ONLY: nenhuma logica de emissao depende disto ainda — apenas
-- prepara o banco para evitar migration arriscada no dia da ativacao.
--
-- Adiciona:
--   - 4 enums fiscais (ModeloDocFiscal, AmbienteFiscal, TipoEmissaoFiscal, StatusSefaz)
--   - dados/config do EMITENTE em configuracao_empresa (CRT, IBGE, CSC, serie/numeracao NFC-e...)
--   - tabela notas_fiscais (documento autorizado vinculado a Venda)
--   - tabela itens_nota_fiscal (snapshot fiscal por item)
--
-- Todos os campos novos sao opcionais ou tem default seguro — nao quebra
-- registros existentes. As colunas fiscais de "produtos" NAO entram aqui:
-- ja foram aplicadas no Neon via `prisma db push` (ver PROGRESSO.md).
-- Aplicar com o backend dev fechado: `npx prisma migrate deploy` (Windows EPERM).

-- CreateEnum
CREATE TYPE "ModeloDocFiscal" AS ENUM ('NFCE_65', 'NFE_55');

-- CreateEnum
CREATE TYPE "AmbienteFiscal" AS ENUM ('HOMOLOGACAO', 'PRODUCAO');

-- CreateEnum
CREATE TYPE "TipoEmissaoFiscal" AS ENUM ('NORMAL', 'CONTINGENCIA_OFFLINE');

-- CreateEnum
CREATE TYPE "StatusSefaz" AS ENUM ('PENDENTE', 'PROCESSANDO', 'AUTORIZADA', 'REJEITADA', 'DENEGADA', 'CANCELADA', 'CONTINGENCIA', 'INUTILIZADA', 'ERRO');

-- AlterTable
ALTER TABLE "configuracao_empresa" ADD COLUMN     "ambienteFiscal" "AmbienteFiscal" NOT NULL DEFAULT 'HOMOLOGACAO',
ADD COLUMN     "certificadoRef" TEXT,
ADD COLUMN     "cnae" TEXT,
ADD COLUMN     "codMunicipioIBGE" TEXT,
ADD COLUMN     "codPais" TEXT NOT NULL DEFAULT '1058',
ADD COLUMN     "codUFIBGE" TEXT,
ADD COLUMN     "crt" INTEGER,
ADD COLUMN     "cscEnc" TEXT,
ADD COLUMN     "cscId" TEXT,
ADD COLUMN     "fiscalAtivo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ieSubstitutoTrib" TEXT,
ADD COLUMN     "inscMunicipal" TEXT,
ADD COLUMN     "nomePais" TEXT NOT NULL DEFAULT 'BRASIL',
ADD COLUMN     "provedorFiscal" TEXT,
ADD COLUMN     "proximoNumeroNfce" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "regimeEspecialISSQN" INTEGER,
ADD COLUMN     "serieNfce" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "notas_fiscais" (
    "id" TEXT NOT NULL,
    "modelo" "ModeloDocFiscal" NOT NULL DEFAULT 'NFCE_65',
    "serie" INTEGER NOT NULL,
    "numeroFiscal" INTEGER NOT NULL,
    "ambiente" "AmbienteFiscal" NOT NULL,
    "tipoEmissao" "TipoEmissaoFiscal" NOT NULL DEFAULT 'NORMAL',
    "status" "StatusSefaz" NOT NULL DEFAULT 'PENDENTE',
    "chaveAcesso" VARCHAR(44),
    "protocolo" TEXT,
    "dataAutorizacao" TIMESTAMP(3),
    "digestValue" TEXT,
    "cStat" VARCHAR(3),
    "xMotivo" TEXT,
    "mensagemErro" TEXT,
    "qrCode" TEXT,
    "urlConsulta" TEXT,
    "xmlAutorizado" TEXT,
    "xmlCancelamento" TEXT,
    "dataCancelamento" TIMESTAMP(3),
    "justificativaCancelamento" TEXT,
    "protocoloCancelamento" TEXT,
    "provedorFiscal" TEXT,
    "idIntegracaoProvedor" TEXT,
    "valorTotal" DECIMAL(10,2) NOT NULL,
    "valorTributos" DECIMAL(10,2),
    "baseCalculoIcms" DECIMAL(10,2),
    "valorIcms" DECIMAL(10,2),
    "valorPis" DECIMAL(10,2),
    "valorCofins" DECIMAL(10,2),
    "destCpfCnpj" TEXT,
    "destNome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "vendaId" TEXT,
    "userId" TEXT,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "notas_fiscais_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "itens_nota_fiscal" (
    "id" TEXT NOT NULL,
    "numeroItem" INTEGER NOT NULL,
    "codigo" TEXT,
    "descricao" TEXT NOT NULL,
    "ncm" VARCHAR(8),
    "cest" VARCHAR(7),
    "cfop" VARCHAR(4),
    "unidade" TEXT,
    "quantidade" DECIMAL(12,3) NOT NULL,
    "valorUnitario" DECIMAL(10,4) NOT NULL,
    "valorTotal" DECIMAL(10,2) NOT NULL,
    "origem" "OrigemMercadoria",
    "cstIcms" VARCHAR(3),
    "csosnIcms" VARCHAR(4),
    "baseIcms" DECIMAL(10,2),
    "aliquotaIcms" DECIMAL(5,2),
    "valorIcms" DECIMAL(10,2),
    "cstPis" VARCHAR(2),
    "valorPis" DECIMAL(10,2),
    "cstCofins" VARCHAR(2),
    "valorCofins" DECIMAL(10,2),
    "notaFiscalId" TEXT NOT NULL,
    "produtoId" TEXT,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "itens_nota_fiscal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notas_fiscais_chaveAcesso_key" ON "notas_fiscais"("chaveAcesso");

-- CreateIndex
CREATE INDEX "notas_fiscais_tenantId_status_idx" ON "notas_fiscais"("tenantId", "status");

-- CreateIndex
CREATE INDEX "notas_fiscais_tenantId_createdAt_idx" ON "notas_fiscais"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "notas_fiscais_vendaId_idx" ON "notas_fiscais"("vendaId");

-- CreateIndex
CREATE UNIQUE INDEX "notas_fiscais_tenantId_modelo_serie_numeroFiscal_key" ON "notas_fiscais"("tenantId", "modelo", "serie", "numeroFiscal");

-- CreateIndex
CREATE INDEX "itens_nota_fiscal_notaFiscalId_idx" ON "itens_nota_fiscal"("notaFiscalId");

-- CreateIndex
CREATE INDEX "itens_nota_fiscal_tenantId_idx" ON "itens_nota_fiscal"("tenantId");

-- AddForeignKey
ALTER TABLE "notas_fiscais" ADD CONSTRAINT "notas_fiscais_vendaId_fkey" FOREIGN KEY ("vendaId") REFERENCES "vendas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notas_fiscais" ADD CONSTRAINT "notas_fiscais_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notas_fiscais" ADD CONSTRAINT "notas_fiscais_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens_nota_fiscal" ADD CONSTRAINT "itens_nota_fiscal_notaFiscalId_fkey" FOREIGN KEY ("notaFiscalId") REFERENCES "notas_fiscais"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens_nota_fiscal" ADD CONSTRAINT "itens_nota_fiscal_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens_nota_fiscal" ADD CONSTRAINT "itens_nota_fiscal_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;


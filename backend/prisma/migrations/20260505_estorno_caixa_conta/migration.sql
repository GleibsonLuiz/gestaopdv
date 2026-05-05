-- Adiciona tipos de movimentacao reversa para quando uma conta paga/recebida
-- e reaberta (ou cancelada apos paga). O estorno gera entrada no caixa quando
-- foi um pagamento (PAGAR_CONTA -> ESTORNO_PAGAR_CONTA = entra dinheiro de
-- volta) e saida quando foi um recebimento (RECEBER_CONTA -> ESTORNO_RECEBER_CONTA).
ALTER TYPE "TipoMovimentacaoCaixa" ADD VALUE 'ESTORNO_PAGAR_CONTA';
ALTER TYPE "TipoMovimentacaoCaixa" ADD VALUE 'ESTORNO_RECEBER_CONTA';

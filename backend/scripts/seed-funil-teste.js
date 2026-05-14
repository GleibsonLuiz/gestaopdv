// Script de teste — popula ~12 oportunidades para validar visualmente o Kanban.
// Todas com prefixo [TESTE-FUNIL] no titulo para limpeza fácil:
//   node backend/scripts/seed-funil-teste.js --clean
// Rodar normal:
//   node backend/scripts/seed-funil-teste.js

import prisma from "../src/lib/prisma.js";

const TAG = "[TESTE-FUNIL]";

const ETAPAS_PROB = {
  LEAD: 10, QUALIFICADO: 30, PROPOSTA: 50,
  NEGOCIACAO: 75, GANHO: 100, PERDIDO: 0,
};

async function limpar() {
  const r = await prisma.oportunidade.deleteMany({
    where: { titulo: { startsWith: TAG } },
  });
  console.log(`Removidas ${r.count} oportunidades de teste`);
}

async function popular() {
  // Resolver autores e clientes ja existentes
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  if (!admin) throw new Error("Nenhum ADMIN encontrado");

  const vendedores = await prisma.user.findMany({
    where: { role: { in: ["GERENTE", "VENDEDOR"] }, ativo: true },
    take: 5,
  });
  const clientes = await prisma.cliente.findMany({ where: { ativo: true }, take: 10 });

  if (vendedores.length === 0) throw new Error("Nenhum vendedor/gerente ativo");
  if (clientes.length === 0) throw new Error("Nenhum cliente ativo");

  const hoje = new Date();
  const daquiA = (dias) => new Date(hoje.getTime() + dias * 86400000);

  // 12 oportunidades temáticas papelaria
  const dados = [
    // LEAD (3)
    {
      titulo: `${TAG} KIT ESCOLAR 2027 - ESCOLA MUNICIPAL CENTRAL`,
      descricao: "INTERESSE EM COTACAO PARA 320 ALUNOS. CONTATO INICIAL VIA INSTAGRAM.",
      etapa: "LEAD", valorEstimado: 28000, origem: "INSTAGRAM",
      dataFechamentoPrevista: daquiA(45),
    },
    {
      titulo: `${TAG} MATERIAL DE ESCRITORIO MENSAL - CONTABILIDADE XPTO`,
      descricao: "EMPRESA PROCURANDO FORNECEDOR FIXO. PEDIRAM TABELA DE PRECOS.",
      etapa: "LEAD", valorEstimado: 1800, origem: "INDICACAO",
      dataFechamentoPrevista: daquiA(20),
    },
    {
      titulo: `${TAG} PERSONALIZACAO DE CADERNOS - ACADEMIA FITNESS`,
      descricao: "ORCAMENTO PARA 50 UNIDADES COM LOGO.",
      etapa: "LEAD", valorEstimado: 950, origem: "WHATSAPP",
      dataFechamentoPrevista: daquiA(10),
    },

    // QUALIFICADO (2)
    {
      titulo: `${TAG} FORMATURA 2026 - 9 ANO COLEGIO SAO JOSE`,
      descricao: "REUNIAO REALIZADA, CONFIRMARAM ORCAMENTO PARA CONVITES E LEMBRANCAS.",
      etapa: "QUALIFICADO", valorEstimado: 12500, origem: "INDICACAO",
      dataFechamentoPrevista: daquiA(30),
    },
    {
      titulo: `${TAG} CARTUCHOS E SUPRIMENTOS - CLINICA ODONTOLOGICA SORRISO`,
      descricao: "ENVIARAM LISTA DE 35 ITENS. PRECISAM DE PRECO POR QUANTIDADE.",
      etapa: "QUALIFICADO", valorEstimado: 3400, origem: "GOOGLE",
      dataFechamentoPrevista: daquiA(15),
    },

    // PROPOSTA (2)
    {
      titulo: `${TAG} CONTRATO ANUAL DE PAPELARIA - PREFEITURA DISTRITAL`,
      descricao: "PROPOSTA ENVIADA EM 03/05. AGUARDANDO RETORNO DO SETOR DE COMPRAS.",
      etapa: "PROPOSTA", valorEstimado: 85000, origem: "SITE",
      dataFechamentoPrevista: daquiA(25),
    },
    {
      titulo: `${TAG} KITS DIA DAS CRIANCAS - LOJA INFANTIL HAPPY KIDS`,
      descricao: "PROPOSTA DE 200 KITS PROMOCIONAIS. CLIENTE PEDIU AJUSTE NO LAYOUT.",
      etapa: "PROPOSTA", valorEstimado: 6200, origem: "INSTAGRAM",
      dataFechamentoPrevista: daquiA(8),
    },

    // NEGOCIACAO (2)
    {
      titulo: `${TAG} MATERIAL DIDATICO 1 SEMESTRE - ESCOLA APRENDER`,
      descricao: "EM NEGOCIACAO DE PRAZO E PARCELAMENTO. CLIENTE QUER 30/60/90 DIAS.",
      etapa: "NEGOCIACAO", valorEstimado: 47000, origem: "INDICACAO",
      dataFechamentoPrevista: daquiA(7),
    },
    {
      titulo: `${TAG} BRINDES CORPORATIVOS NATAL - EMPRESA TECNOLOGIA TECH+`,
      descricao: "300 BRINDES PERSONALIZADOS. NEGOCIANDO DESCONTO POR PAGAMENTO A VISTA.",
      etapa: "NEGOCIACAO", valorEstimado: 18500, origem: "INDICACAO",
      dataFechamentoPrevista: daquiA(3),
    },

    // GANHO (2)
    {
      titulo: `${TAG} CADERNOS UNIVERSITARIOS - LIVRARIA CAMPUS`,
      descricao: "PEDIDO FECHADO. ENTREGA EM 5 DIAS UTEIS.",
      etapa: "GANHO", valorEstimado: 7800, origem: "WHATSAPP",
      dataFechamentoPrevista: daquiA(-2),
    },
    {
      titulo: `${TAG} CANETAS PROMOCIONAIS - CONGRESSO MEDICO`,
      descricao: "500 CANETAS COM LOGO. EVENTO 22/05. FECHADO COM 50% SINAL.",
      etapa: "GANHO", valorEstimado: 4500, origem: "INSTAGRAM",
      dataFechamentoPrevista: daquiA(-1),
    },

    // PERDIDO (1)
    {
      titulo: `${TAG} ARQUIVOS E ARMARIOS - ESCRITORIO ADVOCACIA`,
      descricao: "PROPOSTA ENVIADA MAS CLIENTE OPTOU POR FORNECEDOR LOCAL.",
      etapa: "PERDIDO", valorEstimado: 9200, origem: "GOOGLE",
      motivoPerda: "CLIENTE ESCOLHEU CONCORRENTE COM PRECO 12% MENOR",
      dataFechamentoPrevista: daquiA(-5),
    },
  ];

  let criadas = 0;
  for (let i = 0; i < dados.length; i++) {
    const d = dados[i];
    const cliente = clientes[i % clientes.length];
    const responsavel = vendedores[i % vendedores.length];

    const op = await prisma.$transaction(async (tx) => {
      const criada = await tx.oportunidade.create({
        data: {
          titulo: d.titulo,
          descricao: d.descricao,
          etapa: d.etapa,
          probabilidade: ETAPAS_PROB[d.etapa],
          valorEstimado: d.valorEstimado,
          dataFechamentoPrevista: d.dataFechamentoPrevista,
          origem: d.origem,
          clienteId: cliente.id,
          responsavelId: responsavel.id,
          criadoPorId: admin.id,
          dataGanho: d.etapa === "GANHO" ? new Date() : null,
          dataPerdida: d.etapa === "PERDIDO" ? new Date() : null,
          motivoPerda: d.motivoPerda || null,
        },
      });

      await tx.historicoOportunidade.create({
        data: {
          oportunidadeId: criada.id,
          etapaAnterior: null,
          etapaNova: d.etapa,
          userId: admin.id,
          observacao: "Seed de teste",
        },
      });

      return criada;
    });

    criadas++;
    console.log(`  [${d.etapa}] #${op.numero} ${d.titulo.slice(0, 60)}...`);
  }

  console.log(`\n${criadas} oportunidades de teste criadas`);
}

async function main() {
  const clean = process.argv.includes("--clean");
  try {
    if (clean) await limpar();
    else await popular();
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

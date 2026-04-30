import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { permissoesPadrao, IDS_MODULOS } from "../src/lib/permissoes.js";

const prisma = new PrismaClient();

// ==================== USUÁRIO ADMIN ====================

async function seedAdmin() {
  const senhaHash = await bcrypt.hash("admin123", 10);
  return prisma.user.upsert({
    where: { email: "admin@gestaopro.local" },
    update: { nome: "ADMINISTRADOR", permissoes: IDS_MODULOS },
    create: {
      nome: "ADMINISTRADOR",
      email: "admin@gestaopro.local",
      senha: senhaHash,
      role: "ADMIN",
      permissoes: IDS_MODULOS,
    },
  });
}

// ==================== FUNCIONÁRIOS (20) ====================
// O admin já existe — adicionamos 19 funcionários (5 GERENTES + 14 VENDEDORES) totalizando 20.

const FUNCIONARIOS = [
  { nome: "CARLOS ALBERTO MENDES",   email: "carlos.mendes@gestaopro.local",   role: "GERENTE"  },
  { nome: "MARIANA SOUZA PEREIRA",   email: "mariana.pereira@gestaopro.local", role: "GERENTE"  },
  { nome: "ROBERTO CARLOS ALMEIDA",  email: "roberto.almeida@gestaopro.local", role: "GERENTE"  },
  { nome: "PATRICIA RIBEIRO LIMA",   email: "patricia.lima@gestaopro.local",   role: "GERENTE"  },
  { nome: "THIAGO FERREIRA SANTOS",  email: "thiago.santos@gestaopro.local",   role: "GERENTE"  },
  { nome: "JULIA OLIVEIRA COSTA",    email: "julia.costa@gestaopro.local",     role: "VENDEDOR" },
  { nome: "PEDRO HENRIQUE SOUZA",    email: "pedro.souza@gestaopro.local",     role: "VENDEDOR" },
  { nome: "LARISSA MARTINS DIAS",    email: "larissa.dias@gestaopro.local",    role: "VENDEDOR" },
  { nome: "GUSTAVO RODRIGUES LIMA",  email: "gustavo.lima@gestaopro.local",    role: "VENDEDOR" },
  { nome: "AMANDA SILVA FERNANDES",  email: "amanda.silva@gestaopro.local",    role: "VENDEDOR" },
  { nome: "RICARDO PEREIRA COSTA",   email: "ricardo.costa@gestaopro.local",   role: "VENDEDOR" },
  { nome: "FERNANDA ALVES SANTOS",   email: "fernanda.santos@gestaopro.local", role: "VENDEDOR" },
  { nome: "DANIEL HENRIQUE LIMA",    email: "daniel.lima@gestaopro.local",     role: "VENDEDOR" },
  { nome: "VANESSA BARBOSA COSTA",   email: "vanessa.costa@gestaopro.local",   role: "VENDEDOR" },
  { nome: "LEONARDO MARTINS SILVA",  email: "leonardo.silva@gestaopro.local",  role: "VENDEDOR" },
  { nome: "BRUNA OLIVEIRA SOUZA",    email: "bruna.souza@gestaopro.local",     role: "VENDEDOR" },
  { nome: "FELIPE ALMEIDA PEREIRA",  email: "felipe.pereira@gestaopro.local",  role: "VENDEDOR" },
  { nome: "CAMILA SANTOS LIMA",      email: "camila.lima@gestaopro.local",     role: "VENDEDOR" },
  { nome: "MARCELO COSTA RIBEIRO",   email: "marcelo.ribeiro@gestaopro.local", role: "VENDEDOR" },
];

async function seedFuncionarios() {
  // Senha padrão para todos os funcionários do seed: "func123"
  const senhaHash = await bcrypt.hash("func123", 10);

  const result = [];
  for (const f of FUNCIONARIOS) {
    const permissoes = permissoesPadrao(f.role);
    const funcionario = await prisma.user.upsert({
      where: { email: f.email },
      update: {
        nome: f.nome,
        role: f.role,
        permissoes,
      },
      create: {
        nome: f.nome,
        email: f.email,
        senha: senhaHash,
        role: f.role,
        permissoes,
      },
    });
    result.push(funcionario);
  }
  return result;
}

// ==================== UPPERCASE DE REGISTROS EXISTENTES ====================
// Converte campos textuais já existentes no banco para CAIXA ALTA.
// Emails, senhas, telefones, cnpj/cpfCnpj e cep são preservados.

async function uppercaseExistingData() {
  await prisma.$executeRawUnsafe(`UPDATE users SET nome = UPPER(nome)`);

  await prisma.$executeRawUnsafe(`UPDATE categorias SET nome = UPPER(nome)`);

  await prisma.$executeRawUnsafe(`
    UPDATE clientes SET
      nome = UPPER(nome),
      endereco = UPPER(endereco),
      cidade = UPPER(cidade),
      estado = UPPER(estado),
      observacoes = UPPER(observacoes)
  `);

  await prisma.$executeRawUnsafe(`
    UPDATE fornecedores SET
      nome = UPPER(nome),
      endereco = UPPER(endereco),
      cidade = UPPER(cidade),
      estado = UPPER(estado)
  `);

  await prisma.$executeRawUnsafe(`
    UPDATE produtos SET
      codigo = UPPER(codigo),
      nome = UPPER(nome),
      descricao = UPPER(descricao),
      unidade = UPPER(unidade)
  `);

  await prisma.$executeRawUnsafe(`UPDATE compras SET observacoes = UPPER(observacoes)`);
  await prisma.$executeRawUnsafe(`UPDATE movimentacoes_estoque SET motivo = UPPER(motivo)`);

  await prisma.$executeRawUnsafe(`
    UPDATE contas_pagar SET
      descricao = UPPER(descricao),
      observacoes = UPPER(observacoes)
  `);
  await prisma.$executeRawUnsafe(`
    UPDATE contas_receber SET
      descricao = UPPER(descricao),
      observacoes = UPPER(observacoes)
  `);
}

// ==================== CATEGORIAS ====================

const CATEGORIAS = [
  "ESCRITA",
  "PAPEL",
  "ESCOLAR",
  "ESCRITÓRIO",
  "ORGANIZAÇÃO",
  "ADESIVOS E ETIQUETAS",
  "TECNOLOGIA",
  "MATERIAL DE ARTE",
];

async function seedCategorias() {
  const result = [];
  for (const nome of CATEGORIAS) {
    const c = await prisma.categoria.upsert({
      where: { nome },
      update: {},
      create: { nome },
    });
    result.push(c);
  }
  return result;
}

// ==================== FORNECEDORES (20) ====================

const FORNECEDORES = [
  { nome: "DISTRIBUIDORA FABER-CASTELL SA",  cnpj: "60.500.130/0001-71", email: "vendas@fabercastell.com.br", telefone: "(11) 3030-1000", cidade: "SÃO CARLOS",         estado: "SP" },
  { nome: "BIC BRASIL DISTRIBUIDORA LTDA",   cnpj: "33.070.713/0001-89", email: "atendimento@bic.com.br",     telefone: "(11) 3045-2000", cidade: "MANAUS",             estado: "AM" },
  { nome: "MERCUR DISTRIBUIDORA SUL",        cnpj: "92.755.554/0001-31", email: "comercial@mercur.com.br",    telefone: "(51) 3787-1000", cidade: "SANTA CRUZ DO SUL",  estado: "RS" },
  { nome: "PILOT PEN DO BRASIL",             cnpj: "47.451.041/0001-89", email: "sac@pilotpen.com.br",        telefone: "(11) 3147-3000", cidade: "MANAUS",             estado: "AM" },
  { nome: "TILIBRA ATACADO",                 cnpj: "45.987.123/0001-44", email: "vendas@tilibra.com.br",      telefone: "(14) 3402-9000", cidade: "BAURU",              estado: "SP" },
  { nome: "FORONI DISTRIBUIDORA",            cnpj: "59.123.456/0001-22", email: "comercial@foroni.com.br",    telefone: "(11) 4035-7000", cidade: "CAMPINAS",           estado: "SP" },
  { nome: "TRAMONTINA DISTRIBUIDORA",        cnpj: "92.000.832/0001-26", email: "vendas@tramontina.com.br",   telefone: "(54) 3461-8000", cidade: "CARLOS BARBOSA",     estado: "RS" },
  { nome: "CASIO BRASIL IMPORTAÇÃO",         cnpj: "12.345.678/0001-91", email: "vendas@casio.com.br",        telefone: "(11) 3033-4000", cidade: "SÃO PAULO",          estado: "SP" },
  { nome: "HENKEL BRASIL PRITT",             cnpj: "41.000.420/0001-40", email: "pritt@henkel.com.br",        telefone: "(11) 3897-1000", cidade: "DIADEMA",            estado: "SP" },
  { nome: "CHAMEX DISTRIBUIDORA SP",         cnpj: "06.182.385/0001-72", email: "comercial@chamex.com.br",    telefone: "(11) 3034-6000", cidade: "MOGI GUAÇU",         estado: "SP" },
  { nome: "MAPED DISTRIBUIDORA BRASIL",      cnpj: "08.456.789/0001-50", email: "vendas@maped.com.br",        telefone: "(11) 3171-9000", cidade: "SÃO PAULO",          estado: "SP" },
  { nome: "STABILO BRASIL LTDA",             cnpj: "13.987.654/0001-12", email: "atendimento@stabilo.com.br", telefone: "(11) 3168-3000", cidade: "SÃO PAULO",          estado: "SP" },
  { nome: "PELIKAN DISTRIBUIDORA",           cnpj: "23.456.789/0001-08", email: "vendas@pelikan.com.br",      telefone: "(11) 3022-5000", cidade: "SÃO PAULO",          estado: "SP" },
  { nome: "CIS BRASIL ATACADO",              cnpj: "34.567.890/0001-19", email: "comercial@cis.com.br",       telefone: "(11) 4789-2000", cidade: "COTIA",              estado: "SP" },
  { nome: "ACRILEX DISTRIBUIDORA",           cnpj: "60.745.220/0001-30", email: "vendas@acrilex.com.br",      telefone: "(11) 4754-1000", cidade: "SÃO BERNARDO",       estado: "SP" },
  { nome: "LEO & LEO ATACADO",               cnpj: "45.678.901/0001-25", email: "comercial@leoeleo.com.br",   telefone: "(11) 2942-3000", cidade: "SÃO PAULO",          estado: "SP" },
  { nome: "POLIBRAS INDÚSTRIA",              cnpj: "56.789.012/0001-36", email: "vendas@polibras.com.br",     telefone: "(11) 3568-1000", cidade: "EMBU",               estado: "SP" },
  { nome: "ABC ATACADO PAPELARIA",           cnpj: "67.890.123/0001-47", email: "vendas@abcatacado.com.br",   telefone: "(11) 3333-7000", cidade: "SÃO PAULO",          estado: "SP" },
  { nome: "MERCATUDO DISTRIBUIDORA",         cnpj: "78.901.234/0001-58", email: "comercial@mercatudo.com.br", telefone: "(11) 4444-8000", cidade: "GUARULHOS",          estado: "SP" },
  { nome: "PAPEL & CIA ATACADO",             cnpj: "89.012.345/0001-69", email: "vendas@papelcia.com.br",     telefone: "(11) 5555-9000", cidade: "OSASCO",             estado: "SP" },
];

async function seedFornecedores() {
  const result = [];
  for (const f of FORNECEDORES) {
    const fornecedor = await prisma.fornecedor.upsert({
      where: { cnpj: f.cnpj },
      update: {
        nome: f.nome,
        email: f.email,
        telefone: f.telefone,
        cidade: f.cidade,
        estado: f.estado,
      },
      create: f,
    });
    result.push(fornecedor);
  }
  return result;
}

// ==================== CLIENTES (20) ====================

const CLIENTES = [
  { nome: "MARIA SILVA SANTOS",              cpfCnpj: "111.222.333-01", email: "maria.silva@email.com",       telefone: "(11) 98765-1001", cidade: "SÃO PAULO",   estado: "SP" },
  { nome: "JOÃO PEDRO OLIVEIRA",             cpfCnpj: "111.222.333-02", email: "joao.oliveira@email.com",     telefone: "(11) 98765-1002", cidade: "SÃO PAULO",   estado: "SP" },
  { nome: "ANA CAROLINA SOUZA",              cpfCnpj: "111.222.333-03", email: "ana.souza@email.com",         telefone: "(11) 98765-1003", cidade: "CAMPINAS",    estado: "SP" },
  { nome: "CARLOS EDUARDO LIMA",             cpfCnpj: "111.222.333-04", email: "carlos.lima@email.com",       telefone: "(11) 98765-1004", cidade: "SANTO ANDRÉ", estado: "SP" },
  { nome: "BEATRIZ RODRIGUES",               cpfCnpj: "111.222.333-05", email: "beatriz.rod@email.com",       telefone: "(11) 98765-1005", cidade: "SÃO PAULO",   estado: "SP" },
  { nome: "RAFAEL ALMEIDA COSTA",            cpfCnpj: "111.222.333-06", email: "rafael.costa@email.com",      telefone: "(11) 98765-1006", cidade: "GUARULHOS",   estado: "SP" },
  { nome: "JULIANA FERREIRA",                cpfCnpj: "111.222.333-07", email: "juliana.f@email.com",         telefone: "(11) 98765-1007", cidade: "OSASCO",      estado: "SP" },
  { nome: "LUCAS MARTINS",                   cpfCnpj: "111.222.333-08", email: "lucas.martins@email.com",     telefone: "(11) 98765-1008", cidade: "SÃO PAULO",   estado: "SP" },
  { nome: "FERNANDA CASTRO",                 cpfCnpj: "111.222.333-09", email: "fer.castro@email.com",        telefone: "(11) 98765-1009", cidade: "DIADEMA",     estado: "SP" },
  { nome: "BRUNO HENRIQUE DIAS",             cpfCnpj: "111.222.333-10", email: "bruno.dias@email.com",        telefone: "(11) 98765-1010", cidade: "SÃO PAULO",   estado: "SP" },
  { nome: "ESCOLA MUNICIPAL VILA NOVA",       cpfCnpj: "11.111.111/0001-11", email: "compras@emvilanova.edu.br",   telefone: "(11) 3030-2001", cidade: "SÃO PAULO",   estado: "SP" },
  { nome: "COLÉGIO SABER MAIS LTDA",          cpfCnpj: "11.111.111/0001-12", email: "financeiro@sabermais.com.br", telefone: "(11) 3030-2002", cidade: "SÃO PAULO",   estado: "SP" },
  { nome: "CRECHE SORRISO DE CRIANÇA",        cpfCnpj: "11.111.111/0001-13", email: "contato@cresorriso.com.br",   telefone: "(11) 3030-2003", cidade: "CAMPINAS",    estado: "SP" },
  { nome: "ESCRITÓRIO CONTÁBIL PEREIRA",      cpfCnpj: "11.111.111/0001-14", email: "contato@pereiracontab.com.br", telefone: "(11) 3030-2004", cidade: "SÃO PAULO",   estado: "SP" },
  { nome: "ADVOCACIA LIMA & ASSOCIADOS",      cpfCnpj: "11.111.111/0001-15", email: "lima@adv.com.br",             telefone: "(11) 3030-2005", cidade: "SÃO PAULO",   estado: "SP" },
  { nome: "CLÍNICA ODONTOLÓGICA SORRISOBOM",  cpfCnpj: "11.111.111/0001-16", email: "admin@sorrisobom.com.br",     telefone: "(11) 3030-2006", cidade: "SANTO ANDRÉ", estado: "SP" },
  { nome: "IMOBILIÁRIA SONHO REAL",           cpfCnpj: "11.111.111/0001-17", email: "contato@sonhoreal.com.br",    telefone: "(11) 3030-2007", cidade: "SÃO PAULO",   estado: "SP" },
  { nome: "PADARIA PÃO QUENTINHO",            cpfCnpj: "11.111.111/0001-18", email: "padaria@paoq.com.br",         telefone: "(11) 3030-2008", cidade: "OSASCO",      estado: "SP" },
  { nome: "MERCADO BOM PREÇO",                cpfCnpj: "11.111.111/0001-19", email: "compras@bompreco.com.br",     telefone: "(11) 3030-2009", cidade: "GUARULHOS",   estado: "SP" },
  { nome: "FARMÁCIA VIDA SAUDÁVEL",           cpfCnpj: "11.111.111/0001-20", email: "compras@vidasaudavel.com.br", telefone: "(11) 3030-2010", cidade: "SÃO PAULO",   estado: "SP" },
];

async function seedClientes() {
  const result = [];
  for (const c of CLIENTES) {
    const cliente = await prisma.cliente.upsert({
      where: { cpfCnpj: c.cpfCnpj },
      update: {
        nome: c.nome,
        email: c.email,
        telefone: c.telefone,
        cidade: c.cidade,
        estado: c.estado,
      },
      create: c,
    });
    result.push(cliente);
  }
  return result;
}

// ==================== PRODUTOS (20) ====================

const PRODUTOS_BASE = [
  { codigo: "PAP-0001", nome: "CADERNO UNIVERSITÁRIO 200 FLS TILIBRA",   cat: "PAPEL",        precoCusto: 14.50, precoVenda: 24.90, est: 0, min: 10, unidade: "UN" },
  { codigo: "PAP-0002", nome: "CANETA ESFEROGRÁFICA AZUL BIC CRISTAL",   cat: "ESCRITA",      precoCusto:  0.85, precoVenda:  1.99, est: 0, min: 50, unidade: "UN" },
  { codigo: "PAP-0003", nome: "CANETA ESFEROGRÁFICA PRETA BIC CRISTAL",  cat: "ESCRITA",      precoCusto:  0.85, precoVenda:  1.99, est: 0, min: 50, unidade: "UN" },
  { codigo: "PAP-0004", nome: "CANETA ESFEROGRÁFICA VERMELHA BIC",       cat: "ESCRITA",      precoCusto:  0.85, precoVenda:  1.99, est: 0, min: 30, unidade: "UN" },
  { codigo: "PAP-0005", nome: "LÁPIS PRETO HB FABER-CASTELL",            cat: "ESCRITA",      precoCusto:  0.45, precoVenda:  1.20, est: 0, min: 80, unidade: "UN" },
  { codigo: "PAP-0006", nome: "BORRACHA BRANCA MERCUR PEQUENA",          cat: "ESCOLAR",      precoCusto:  0.55, precoVenda:  1.50, est: 0, min: 40, unidade: "UN" },
  { codigo: "PAP-0007", nome: "APONTADOR COM DEPÓSITO FABER-CASTELL",    cat: "ESCOLAR",      precoCusto:  1.80, precoVenda:  3.99, est: 0, min: 25, unidade: "UN" },
  { codigo: "PAP-0008", nome: "RÉGUA ACRÍLICA 30CM WALEU",               cat: "ESCOLAR",      precoCusto:  1.20, precoVenda:  2.99, est: 0, min: 30, unidade: "UN" },
  { codigo: "PAP-0009", nome: "TESOURA ESCOLAR 13CM TRAMONTINA",         cat: "ESCOLAR",      precoCusto:  4.50, precoVenda:  9.90, est: 0, min: 20, unidade: "UN" },
  { codigo: "PAP-0010", nome: "COLA BRANCA TENAZ 90G HENKEL",            cat: "ESCOLAR",      precoCusto:  3.20, precoVenda:  6.50, est: 0, min: 25, unidade: "UN" },
  { codigo: "PAP-0011", nome: "COLA BASTÃO PRITT 21G",                   cat: "ESCOLAR",      precoCusto:  4.80, precoVenda:  9.90, est: 0, min: 20, unidade: "UN" },
  { codigo: "PAP-0012", nome: "PAPEL SULFITE A4 500FLS CHAMEX",          cat: "PAPEL",        precoCusto: 22.00, precoVenda: 32.90, est: 0, min: 15, unidade: "UN" },
  { codigo: "PAP-0013", nome: "PASTA POLIONDA OFÍCIO AZUL",              cat: "ORGANIZAÇÃO",  precoCusto:  4.20, precoVenda:  7.99, est: 0, min: 20, unidade: "UN" },
  { codigo: "PAP-0014", nome: "GRAMPEADOR 26/6 MAPED MÉDIO",             cat: "ESCRITÓRIO",   precoCusto: 18.00, precoVenda: 34.90, est: 0, min: 10, unidade: "UN" },
  { codigo: "PAP-0015", nome: "GRAMPOS 26/6 CAIXA C/ 5000",              cat: "ESCRITÓRIO",   precoCusto:  6.00, precoVenda: 12.90, est: 0, min: 15, unidade: "CX" },
  { codigo: "PAP-0016", nome: "MARCA TEXTO AMARELO PILOT SPOTLITER",     cat: "ESCRITA",      precoCusto:  2.40, precoVenda:  4.99, est: 0, min: 30, unidade: "UN" },
  { codigo: "PAP-0017", nome: "CANETA MARCADOR QUADRO BRANCO PILOT",     cat: "ESCRITA",      precoCusto:  4.10, precoVenda:  8.90, est: 0, min: 20, unidade: "UN" },
  { codigo: "PAP-0018", nome: "ESTOJO ESCOLAR 3 DIVISÓRIAS",             cat: "ORGANIZAÇÃO",  precoCusto: 12.00, precoVenda: 24.90, est: 0, min: 15, unidade: "UN" },
  { codigo: "PAP-0019", nome: "MOCHILA ESCOLAR REFORÇADA",               cat: "ORGANIZAÇÃO",  precoCusto: 65.00, precoVenda: 129.90, est: 0, min: 5,  unidade: "UN" },
  { codigo: "PAP-0020", nome: "CALCULADORA CASIO HR-100 COM BOBINA",     cat: "TECNOLOGIA",   precoCusto: 145.00, precoVenda: 249.90, est: 0, min: 3,  unidade: "UN" },
];

async function seedProdutos(categorias, fornecedores) {
  const catByName = new Map(categorias.map(c => [c.nome, c.id]));
  const result = [];
  for (let i = 0; i < PRODUTOS_BASE.length; i++) {
    const p = PRODUTOS_BASE[i];
    const fornecedor = fornecedores[i % fornecedores.length];
    const descricao = `${p.nome} - PRODUTO DE PAPELARIA`;
    const produto = await prisma.produto.upsert({
      where: { codigo: p.codigo },
      update: {
        nome: p.nome,
        descricao,
        unidade: p.unidade,
      },
      create: {
        codigo: p.codigo,
        nome: p.nome,
        descricao,
        precoVenda: p.precoVenda,
        precoCusto: p.precoCusto,
        estoque: p.est,
        estoqueMinimo: p.min,
        unidade: p.unidade,
        categoriaId: catByName.get(p.cat) || null,
        fornecedorId: fornecedor.id,
      },
    });
    result.push(produto);
  }
  return result;
}

// ==================== COMPRAS (20) ====================

async function seedCompras(adminId, fornecedores, produtos) {
  const existentes = await prisma.compra.count();
  if (existentes >= 20) {
    console.log(`  (já existem ${existentes} compras — pulando)`);
    return [];
  }

  const result = [];
  const produtosPorFornecedor = new Map();
  for (const p of produtos) {
    if (!produtosPorFornecedor.has(p.fornecedorId)) {
      produtosPorFornecedor.set(p.fornecedorId, []);
    }
    produtosPorFornecedor.get(p.fornecedorId).push(p);
  }

  for (let i = 0; i < 20; i++) {
    const fornecedor = fornecedores[i % fornecedores.length];
    let prodsForn = produtosPorFornecedor.get(fornecedor.id) || [];
    if (prodsForn.length === 0) prodsForn = [produtos[i % produtos.length]];

    const numItens = (i % 3) + 1;
    const itens = [];
    for (let j = 0; j < numItens; j++) {
      const prod = prodsForn[j % prodsForn.length];
      const quantidade = 10 + (i + j) * 5;
      const precoUnitario = Number(prod.precoCusto || 1);
      itens.push({ produto: prod, quantidade, precoUnitario });
    }
    const total = itens.reduce((acc, it) => acc + it.quantidade * it.precoUnitario, 0);

    const diasAtras = (i + 1) * 3;
    const dataCompra = new Date();
    dataCompra.setDate(dataCompra.getDate() - diasAtras);

    await prisma.$transaction(async (tx) => {
      const compra = await tx.compra.create({
        data: {
          fornecedorId: fornecedor.id,
          total,
          observacoes: `NF-${String(1000 + i).padStart(4, "0")}`,
          createdAt: dataCompra,
          itens: {
            create: itens.map(it => ({
              produtoId: it.produto.id,
              quantidade: it.quantidade,
              precoUnitario: it.precoUnitario,
              subtotal: it.quantidade * it.precoUnitario,
            })),
          },
        },
      });

      for (const it of itens) {
        const prodAtual = await tx.produto.findUnique({ where: { id: it.produto.id } });
        const antes = prodAtual.estoque;
        const depois = antes + it.quantidade;
        await tx.produto.update({
          where: { id: it.produto.id },
          data: { estoque: depois },
        });
        await tx.movimentacaoEstoque.create({
          data: {
            tipo: "ENTRADA",
            quantidade: it.quantidade,
            estoqueAntes: antes,
            estoqueDepois: depois,
            motivo: `COMPRA #${compra.numero}`,
            produtoId: it.produto.id,
            userId: adminId,
            createdAt: dataCompra,
          },
        });
      }

      result.push(compra);
    });
  }
  return result;
}

// ==================== CONTAS A PAGAR (20) ====================

async function seedContasPagar(fornecedores) {
  const existentes = await prisma.contaPagar.count();
  if (existentes >= 20) {
    console.log(`  (já existem ${existentes} contas a pagar — pulando)`);
    return;
  }

  const hoje = new Date();
  const descricoes = [
    "ALUGUEL DA LOJA",
    "CONTA DE ENERGIA ELÉTRICA",
    "CONTA DE ÁGUA",
    "INTERNET FIBRA 500MBPS",
    "TELEFONE FIXO",
    "REPOSIÇÃO DE ESTOQUE - CADERNOS",
    "REPOSIÇÃO DE ESTOQUE - CANETAS",
    "REPOSIÇÃO DE ESTOQUE - PAPEL A4",
    "MANUTENÇÃO DO SISTEMA PDV",
    "HONORÁRIOS CONTÁBEIS MENSAIS",
    "LIMPEZA E CONSERVAÇÃO",
    "VALE ALIMENTAÇÃO FUNCIONÁRIOS",
    "PLANO DE SAÚDE FUNCIONÁRIOS",
    "IMPOSTO IPTU PARCELA",
    "IMPOSTO SIMPLES NACIONAL",
    "FRETE DISTRIBUIDORA",
    "MATERIAL DE ESCRITÓRIO ADMINISTRATIVO",
    "MANUTENÇÃO DO AR-CONDICIONADO",
    "SEGUROS - APÓLICE LOJA",
    "MARKETING DIGITAL - MÍDIAS SOCIAIS",
  ];
  const valores = [3500, 850, 320, 199.90, 89.90, 1850, 2200, 1200, 450, 800, 600, 1200, 1800, 420, 980, 350, 280, 250, 720, 600];

  const dados = [];
  for (let i = 0; i < 20; i++) {
    let status, vencimento, pagamento = null;
    if (i < 6) {
      status = "ATRASADA";
      vencimento = new Date(hoje); vencimento.setDate(hoje.getDate() - (i + 5));
    } else if (i < 14) {
      status = "PENDENTE";
      vencimento = new Date(hoje); vencimento.setDate(hoje.getDate() + (i - 5) * 3);
    } else {
      status = "PAGA";
      vencimento = new Date(hoje); vencimento.setDate(hoje.getDate() - (i + 10));
      pagamento = new Date(vencimento); pagamento.setDate(vencimento.getDate() - 1);
    }

    dados.push({
      descricao: descricoes[i],
      valor: valores[i],
      vencimento,
      pagamento,
      status,
      fornecedorId: fornecedores[i % fornecedores.length].id,
      observacoes: status === "PAGA" ? "PAGO EM DIA" : null,
    });
  }
  await prisma.contaPagar.createMany({ data: dados });
}

// ==================== CONTAS A RECEBER (20) ====================

async function seedContasReceber(clientes) {
  const existentes = await prisma.contaReceber.count();
  if (existentes >= 20) {
    console.log(`  (já existem ${existentes} contas a receber — pulando)`);
    return;
  }

  const hoje = new Date();
  const descricoes = [
    "VENDA CREDIÁRIO - MATERIAL ESCOLAR",
    "PEDIDO ESPECIAL - CADERNOS PERSONALIZADOS",
    "COMPRA A PRAZO - PAPEL A4 CAIXA",
    "CREDIÁRIO - KIT VOLTA ÀS AULAS",
    "PEDIDO FATURADO - ESCOLA VILA NOVA",
    "MATERIAL DE ESCRITÓRIO - PEDIDO EMPRESA",
    "COMPRA PRAZO - MOCHILAS ESCOLARES",
    "VENDA 30 DIAS - CANETAS ATACADO",
    "PEDIDO FATURADO - COLÉGIO SABER MAIS",
    "CREDIÁRIO - ESTOJO + LÁPIS",
    "MATERIAL GRÁFICO - ESCRITÓRIO PEREIRA",
    "VENDA BOLETO 30D - CALCULADORAS",
    "FATURAMENTO - CRECHE SORRISO",
    "PEDIDO FATURADO - ADVOCACIA LIMA",
    "CREDIÁRIO CLIENTE FIDELIDADE",
    "VENDA PRAZO - CLÍNICA SORRISOBOM",
    "MATERIAL APRESENTAÇÃO - IMOBILIÁRIA",
    "PEDIDO RECORRENTE - PADARIA PÃO Q.",
    "FATURAMENTO - MERCADO BOM PREÇO",
    "MATERIAL PAPELARIA - FARMÁCIA VIDA",
  ];
  const valores = [180, 420, 350, 290, 1500, 680, 1200, 240, 2100, 95, 380, 549.80, 850, 320, 175, 460, 280, 130, 920, 195];

  const dados = [];
  for (let i = 0; i < 20; i++) {
    let status, vencimento, recebimento = null;
    if (i < 4) {
      status = "ATRASADA";
      vencimento = new Date(hoje); vencimento.setDate(hoje.getDate() - (i + 3));
    } else if (i < 14) {
      status = "PENDENTE";
      vencimento = new Date(hoje); vencimento.setDate(hoje.getDate() + (i - 3) * 4);
    } else {
      status = "PAGA";
      vencimento = new Date(hoje); vencimento.setDate(hoje.getDate() - (i + 8));
      recebimento = new Date(vencimento); recebimento.setDate(vencimento.getDate() - 2);
    }

    dados.push({
      descricao: descricoes[i],
      valor: valores[i],
      vencimento,
      recebimento,
      status,
      clienteId: clientes[i % clientes.length].id,
      observacoes: status === "PAGA" ? "RECEBIDO ANTECIPADO" : null,
    });
  }
  await prisma.contaReceber.createMany({ data: dados });
}

// ==================== MAIN ====================

async function main() {
  console.log("Iniciando seed do banco de dados...\n");

  console.log("→ Convertendo registros existentes para CAIXA ALTA");
  await uppercaseExistingData();

  console.log("→ Usuário admin");
  const admin = await seedAdmin();

  console.log("→ Funcionários");
  const funcionarios = await seedFuncionarios();
  console.log(`  ${funcionarios.length} funcionários adicionados (senha padrão: func123)`);

  console.log("→ Categorias");
  const categorias = await seedCategorias();
  console.log(`  ${categorias.length} categorias`);

  console.log("→ Fornecedores");
  const fornecedores = await seedFornecedores();
  console.log(`  ${fornecedores.length} fornecedores`);

  console.log("→ Clientes");
  const clientes = await seedClientes();
  console.log(`  ${clientes.length} clientes`);

  console.log("→ Produtos");
  const produtos = await seedProdutos(categorias, fornecedores);
  console.log(`  ${produtos.length} produtos`);

  console.log("→ Compras (gera estoque + movimentações)");
  const compras = await seedCompras(admin.id, fornecedores, produtos);
  console.log(`  ${compras.length} compras criadas`);

  console.log("→ Contas a pagar");
  await seedContasPagar(fornecedores);

  console.log("→ Contas a receber");
  await seedContasReceber(clientes);

  const stats = {
    users: await prisma.user.count(),
    categorias: await prisma.categoria.count(),
    fornecedores: await prisma.fornecedor.count(),
    clientes: await prisma.cliente.count(),
    produtos: await prisma.produto.count(),
    compras: await prisma.compra.count(),
    movimentacoes: await prisma.movimentacaoEstoque.count(),
    contasPagar: await prisma.contaPagar.count(),
    contasReceber: await prisma.contaReceber.count(),
  };

  console.log("\n✅ Seed concluído.");
  console.log("------------------------------");
  console.log(`  Usuários:           ${stats.users}`);
  console.log(`  Categorias:         ${stats.categorias}`);
  console.log(`  Fornecedores:       ${stats.fornecedores}`);
  console.log(`  Clientes:           ${stats.clientes}`);
  console.log(`  Produtos:           ${stats.produtos}`);
  console.log(`  Compras:            ${stats.compras}`);
  console.log(`  Movimentações:      ${stats.movimentacoes}`);
  console.log(`  Contas a pagar:     ${stats.contasPagar}`);
  console.log(`  Contas a receber:   ${stats.contasReceber}`);
  console.log("------------------------------");
  console.log(`  Login:  ${admin.email}`);
  console.log(`  Senha:  admin123`);
}

main()
  .catch((e) => {
    console.error("❌ Erro no seed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

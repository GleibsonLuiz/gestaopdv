import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import prisma from "../lib/prisma.js";
import { registrarEvento } from "../middlewares/auditoria.js";
import { registrarFalhaLogin, limparThrottleLogin } from "../middlewares/rateLimitLogin.js";
import { modulosDaEmpresa } from "../lib/modulosPlano.js";
import {
  lerDispositivoDaRequest, validarLoginDispositivo, dispositivoSegueAtivo,
  revogarDispositivo,
} from "../lib/dispositivos.js";

export async function login(req, res, next) {
  try {
    const { email, senha } = req.body;
    if (!email || !senha) {
      return res.status(400).json({ erro: "Email e senha sao obrigatorios" });
    }

    // Multi-tenant: include = tenant para emitir o JWT com o tenantId
    // do usuario. findFirst e necessario porque User.email virou
    // @@unique([tenantId, email]) na ETAPA 1.
    const user = await prisma.user.findFirst({
      where: { email },
      include: {
        tenant: {
          select: {
            id: true, nome: true, cnpj: true, ativo: true,
            motivoSuspensao: true, suspensaEm: true,
            plano: true, expiraEm: true,
            segmento: true, modulosHabilitados: true,
          },
        },
      },
    });
    if (!user || !user.ativo) {
      registrarEvento({
        acao: "LOGIN_FALHO", modulo: "AUTH", sucesso: false,
        usuarioEmail: email, mensagem: user ? "Usuario inativo" : "Email nao encontrado", req,
        // tenantId: null para email inexistente (nao da pra adivinhar antes
        // de validar). Para usuario inativo, sabemos o tenant.
        tenantId: user?.tenantId || null,
      });
      await registrarFalhaLogin(req);
      return res.status(401).json({ erro: "Credenciais invalidas" });
    }

    // Bloqueio: tenant precisa existir e estar ativo. Se tenantId esta
    // null (deve so acontecer em legado pre-ETAPA-1), recusamos o login
    // ao inves de emitir um JWT sem tid. Mensagem generica para nao
    // vazar info da arquitetura.
    if (!user.tenantId || !user.tenant || !user.tenant.ativo) {
      registrarEvento({
        acao: "LOGIN_FALHO", modulo: "AUTH", sucesso: false,
        usuarioId: user.id, usuarioNome: user.nome, usuarioEmail: user.email,
        mensagem: !user.tenantId
          ? "Usuario sem tenantId atribuido"
          : !user.tenant
            ? "Tenant nao encontrado"
            : "Tenant inativo",
        req,
        tenantId: user.tenantId || null,
      });
      // ETAPA 11: se houve motivo de suspensao, retorna pro front exibir.
      const motivo = user.tenant?.motivoSuspensao || null;
      return res.status(403).json({
        erro: motivo
          ? `Conta suspensa: ${motivo}`
          : "Conta indisponivel. Contate o suporte.",
        motivoSuspensao: motivo,
        suspensaEm: user.tenant?.suspensaEm || null,
      });
    }

    // ETAPA 12: bloqueio por plano expirado. Super-admin pode renovar via
    // /admin-master. Mensagem clara pra cliente saber o que precisa.
    if (user.tenant.expiraEm && new Date(user.tenant.expiraEm) < new Date()) {
      const data = new Date(user.tenant.expiraEm).toLocaleDateString("pt-BR");
      registrarEvento({
        acao: "LOGIN_FALHO", modulo: "AUTH", sucesso: false,
        usuarioId: user.id, usuarioNome: user.nome, usuarioEmail: user.email,
        mensagem: `Plano ${user.tenant.plano} expirado em ${data}`,
        req, tenantId: user.tenantId,
      });
      return res.status(403).json({
        erro: `Plano ${user.tenant.plano} expirado em ${data}. Contate o suporte para renovar.`,
        planoExpirado: true,
        plano: user.tenant.plano,
        expiraEm: user.tenant.expiraEm,
      });
    }

    const ok = await bcrypt.compare(senha, user.senha);
    if (!ok) {
      registrarEvento({
        acao: "LOGIN_FALHO", modulo: "AUTH", sucesso: false,
        usuarioId: user.id, usuarioNome: user.nome, usuarioEmail: user.email,
        mensagem: "Senha incorreta", req,
        tenantId: user.tenantId,
      });
      await registrarFalhaLogin(req);
      return res.status(401).json({ erro: "Credenciais invalidas" });
    }

    // Login valido — zera o contador de tentativas (IP + email).
    await limparThrottleLogin(req);

    // CONTROLE DE LICENCA POR MAQUINA: valida/registra o dispositivo (header
    // X-Device-Id). Se a empresa tem limite (maxDispositivos) e este e um
    // device novo que estouraria a cota, bloqueia com a lista de maquinas
    // ativas para o proprio cliente derrubar uma antiga (self-service).
    const infoDispositivo = lerDispositivoDaRequest(req);
    const veredito = await validarLoginDispositivo({
      tenantId: user.tenantId,
      userId: user.id,
      fingerprint: infoDispositivo.fingerprint,
      nome: infoDispositivo.nome,
      userAgent: infoDispositivo.userAgent,
      ip: infoDispositivo.ip,
    });
    if (!veredito.liberado) {
      registrarEvento({
        acao: "LOGIN_FALHO", modulo: "AUTH", sucesso: false,
        usuarioId: user.id, usuarioNome: user.nome, usuarioEmail: user.email,
        mensagem: `Limite de dispositivos atingido (${veredito.max})`,
        req, tenantId: user.tenantId,
      });
      return res.status(403).json({
        erro: `Limite de ${veredito.max} dispositivo(s) atingido para esta conta. `
          + "Desconecte uma maquina em uso para liberar o acesso neste dispositivo.",
        dispositivoBloqueado: true,
        max: veredito.max,
        dispositivos: veredito.dispositivos,
      });
    }
    const dispositivoId = veredito.dispositivo?.id || null;

    // JWT inclui `tid` (tenant id) que sera usado pelo middleware da
    // ETAPA 3 para injetar req.tenantId em toda request. `sa` (super
    // admin) e adicionado na ETAPA 10 para destravar o acesso a
    // /admin-master. `did` (device id) permite invalidar a sessao no boot
    // (/auth/me) quando o admin revoga o dispositivo.
    const token = jwt.sign(
      {
        sub: user.id, role: user.role, nome: user.nome,
        tid: user.tenantId,
        sa: user.superAdmin === true,
        did: dispositivoId,
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
    );

    registrarEvento({
      acao: "LOGIN", modulo: "AUTH", sucesso: true,
      usuarioId: user.id, usuarioNome: user.nome, usuarioEmail: user.email, req,
      tenantId: user.tenantId,
    });

    res.json({
      token,
      user: {
        id: user.id, nome: user.nome, email: user.email,
        role: user.role, permissoes: user.permissoes,
        tenantId: user.tenantId,
        superAdmin: user.superAdmin === true,
        preferencias: user.preferencias || null,
      },
      empresa: {
        id: user.tenant.id,
        nome: user.tenant.nome,
        cnpj: user.tenant.cnpj,
        segmento: user.tenant.segmento,
        // Modulos efetivos (pacote do plano + override) — frontend gateia a sidebar.
        modulos: modulosDaEmpresa(user.tenant),
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function me(req, res, next) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.sub },
      select: {
        id: true, nome: true, email: true, role: true, ativo: true, permissoes: true,
        superAdmin: true,
        preferencias: true,
        tenantId: true,
        tenant: { select: { id: true, nome: true, cnpj: true, ativo: true, segmento: true, plano: true, modulosHabilitados: true } },
      },
    });
    if (!user) return res.status(404).json({ erro: "Usuario nao encontrado" });

    // CONTROLE DE LICENCA: se o dispositivo desta sessao (claim `did`) foi
    // revogado (admin liberou a vaga, ou o cliente derrubou esta maquina de
    // outro lugar), invalidamos a sessao com 401 — o front limpa e redireciona
    // para o login. Tambem atualiza o ultimoAcessoEm (heartbeat do device).
    const ip = (typeof req.headers["x-forwarded-for"] === "string"
      && req.headers["x-forwarded-for"].split(",")[0].trim()) || req.ip || null;
    const ativo = await dispositivoSegueAtivo(req.user.did, ip);
    if (!ativo) {
      return res.status(401).json({
        erro: "Este dispositivo foi desconectado. Faca login novamente.",
        dispositivoRevogado: true,
      });
    }

    const { tenant, ...rest } = user;
    res.json({
      ...rest,
      empresa: tenant ? {
        id: tenant.id, nome: tenant.nome, cnpj: tenant.cnpj, segmento: tenant.segmento,
        modulos: modulosDaEmpresa(tenant),
      } : null,
    });
  } catch (err) {
    next(err);
  }
}

// Sincroniza preferencias de UI (tema/aparencia, sidebar) entre dispositivos.
// O front faz merge otimista no localStorage e dispara PUT em paralelo —
// best-effort, falha de rede nao bloqueia a UI. Payload aceita qualquer JSON
// objeto; campos desconhecidos sao preservados (merge raso por chave de topo).
export async function salvarPreferencias(req, res, next) {
  try {
    const body = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return res.status(400).json({ erro: "Preferencias devem ser um objeto JSON" });
    }
    // Limite de tamanho para nao virar dump-zone. ~16KB cobre folgado
    // qualquer preferencia razoavel; alem disso, recusa.
    const tamanho = JSON.stringify(body).length;
    if (tamanho > 16384) {
      return res.status(413).json({ erro: "Preferencias excedem o limite de 16KB" });
    }

    const atual = await prisma.user.findUnique({
      where: { id: req.user.sub },
      select: { preferencias: true },
    });
    if (!atual) return res.status(404).json({ erro: "Usuario nao encontrado" });

    const merged = { ...(atual.preferencias || {}), ...body };
    const updated = await prisma.user.update({
      where: { id: req.user.sub },
      data: { preferencias: merged },
      select: { preferencias: true },
    });
    res.json({ preferencias: updated.preferencias });
  } catch (err) {
    next(err);
  }
}

export async function logout(req, res, next) {
  try {
    registrarEvento({
      acao: "LOGOUT", modulo: "AUTH", sucesso: true,
      usuarioId: req.user?.sub || null,
      usuarioNome: req.user?.nome || null,
      req,
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

// POST /auth/dispositivos/revogar — auto-derrubada (self-service) a partir da
// tela de bloqueio por limite de maquinas. O usuario AINDA NAO esta logado
// (o login foi recusado), entao re-validamos email+senha aqui antes de liberar
// a vaga. Rate-limitada como o login para evitar abuso/forca-bruta.
export async function revogarDispositivoSelfService(req, res, next) {
  try {
    const { email, senha, dispositivoId } = req.body || {};
    if (!email || !senha || !dispositivoId) {
      return res.status(400).json({ erro: "Email, senha e dispositivo sao obrigatorios" });
    }

    const user = await prisma.user.findFirst({
      where: { email },
      select: { id: true, nome: true, email: true, senha: true, ativo: true, tenantId: true },
    });
    // Mensagem generica em qualquer falha de credencial (nao vaza existencia).
    if (!user || !user.ativo || !user.tenantId) {
      await registrarFalhaLogin(req);
      return res.status(401).json({ erro: "Credenciais invalidas" });
    }
    const ok = await bcrypt.compare(senha, user.senha);
    if (!ok) {
      await registrarFalhaLogin(req);
      return res.status(401).json({ erro: "Credenciais invalidas" });
    }
    await limparThrottleLogin(req);

    const revogado = await revogarDispositivo({
      tenantId: user.tenantId, dispositivoId, por: "CLIENTE",
    });
    if (!revogado) {
      return res.status(404).json({ erro: "Dispositivo nao encontrado" });
    }

    registrarEvento({
      acao: "DISPOSITIVO_REVOGADO", modulo: "AUTH", sucesso: true,
      usuarioId: user.id, usuarioNome: user.nome, usuarioEmail: user.email,
      mensagem: `Cliente desconectou o dispositivo ${dispositivoId}`,
      req, tenantId: user.tenantId,
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

export async function trocarSenha(req, res, next) {
  try {
    const { senhaAtual, senhaNova } = req.body;
    if (!senhaAtual || !senhaNova) {
      return res.status(400).json({ erro: "Senha atual e nova sao obrigatorias" });
    }
    if (typeof senhaNova !== "string" || senhaNova.length < 6) {
      return res.status(400).json({ erro: "A nova senha deve ter pelo menos 6 caracteres" });
    }
    if (senhaAtual === senhaNova) {
      return res.status(400).json({ erro: "A nova senha deve ser diferente da atual" });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.sub } });
    if (!user) return res.status(404).json({ erro: "Usuario nao encontrado" });
    if (!user.ativo) return res.status(403).json({ erro: "Usuario inativo" });

    const ok = await bcrypt.compare(senhaAtual, user.senha);
    if (!ok) {
      registrarEvento({
        acao: "TROCA_SENHA", modulo: "AUTH", sucesso: false,
        usuarioId: user.id, usuarioNome: user.nome, usuarioEmail: user.email,
        mensagem: "Senha atual incorreta", req,
      });
      return res.status(401).json({ erro: "Senha atual incorreta" });
    }

    const hash = await bcrypt.hash(senhaNova, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: { senha: hash },
    });

    registrarEvento({
      acao: "TROCA_SENHA", modulo: "AUTH", sucesso: true,
      usuarioId: user.id, usuarioNome: user.nome, usuarioEmail: user.email, req,
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

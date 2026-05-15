// Empresa.jsx — tela de gestao da empresa (tenant) atual.
//
// Combina duas visualizacoes:
//   1. Identidade do tenant (Empresa): nome, cnpj, status, estatisticas
//      e botao de edicao (so ADMIN). Dados vem de GET /empresa.
//   2. Dados fiscais (ConfiguracaoEmpresa): reutiliza o componente
//      Configuracoes.jsx que ja gerencia razao social, telefone,
//      endereco e logotipo.
//
// Apos atualizar a identidade do tenant, sincronizamos o cache de
// empresa do localStorage para o header refletir o novo nome.

import { useEffect, useState } from "react";
import { C } from "./lib/theme.js";
import { api, setSession, getToken, getUser, getEmpresa } from "./lib/api.js";
import Configuracoes from "./Configuracoes.jsx";

function mascararCnpj(v) {
  const d = String(v || "").replace(/\D/g, "").slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

function fmtData(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function fmtNum(n) {
  return Number(n || 0).toLocaleString("pt-BR");
}

export default function Empresa({ user }) {
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [editando, setEditando] = useState(false);

  // Form de edicao
  const [nome, setNome] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erroSalvar, setErroSalvar] = useState("");

  const podeEditar = user.role === "ADMIN";

  useEffect(() => {
    let ativo = true;
    api.obterEmpresa()
      .then(e => {
        if (!ativo) return;
        setDados(e);
        setNome(e.nome || "");
        setCnpj(mascararCnpj(e.cnpj || ""));
      })
      .catch(err => ativo && setErro(err.message || "Erro ao carregar empresa"))
      .finally(() => ativo && setCarregando(false));
    return () => { ativo = false; };
  }, []);

  async function salvar(e) {
    e.preventDefault();
    setSalvando(true);
    setErroSalvar("");
    try {
      const nomeLimpo = nome.trim();
      if (!nomeLimpo || nomeLimpo.length < 3) {
        setErroSalvar("Nome da empresa deve ter pelo menos 3 caracteres");
        return;
      }
      const cnpjDigitos = cnpj.replace(/\D/g, "");
      if (cnpjDigitos && cnpjDigitos.length !== 14) {
        setErroSalvar("CNPJ deve ter 14 dígitos ou ficar vazio");
        return;
      }
      const atualizada = await api.atualizarEmpresa({
        nome: nomeLimpo,
        cnpj: cnpjDigitos || null,
      });

      // Sincroniza cache local da empresa (usado por outros lugares do app
      // que leem via getEmpresa() — header, etc).
      const token = getToken();
      const user = getUser();
      if (token && user) {
        setSession(token, user, {
          id: atualizada.id, nome: atualizada.nome, cnpj: atualizada.cnpj,
        });
      }

      setDados(d => ({ ...d, ...atualizada }));
      setEditando(false);
    } catch (err) {
      setErroSalvar(err.message || "Erro ao salvar");
    } finally {
      setSalvando(false);
    }
  }

  function cancelarEdicao() {
    if (!dados) return;
    setNome(dados.nome || "");
    setCnpj(mascararCnpj(dados.cnpj || ""));
    setErroSalvar("");
    setEditando(false);
  }

  if (carregando) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: C.muted }}>
        Carregando dados da empresa...
      </div>
    );
  }

  if (erro || !dados) {
    return (
      <div style={{
        padding: "12px 16px", margin: 16, borderRadius: 10,
        background: C.red + "22", border: `1px solid ${C.red}55`, color: C.red,
      }}>
        {erro || "Empresa não encontrada"}
      </div>
    );
  }

  return (
    <div>
      {/* ============ BLOCO 1: IDENTIDADE DO TENANT ============ */}
      <div style={{
        background: C.card, border: `1px solid ${C.border}`,
        borderRadius: 12, padding: 20, marginBottom: 20,
      }}>
        <div style={{
          display: "flex", justifyContent: "space-between",
          alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 16,
        }}>
          <div>
            <div style={{ color: C.muted, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
              Identidade da empresa
            </div>
            <div style={{ color: C.white, fontSize: 24, fontWeight: 800, marginTop: 4 }}>
              {dados.nome}
            </div>
            <div style={{ color: C.muted, fontSize: 13, marginTop: 4 }}>
              {dados.cnpj ? `CNPJ ${mascararCnpj(dados.cnpj)}` : "Sem CNPJ cadastrado"}
              {" · "}
              <span style={{ color: dados.ativo ? C.green : C.red }}>
                {dados.ativo ? "● Ativa" : "● Inativa"}
              </span>
            </div>
            <div style={{ color: C.muted, fontSize: 12, marginTop: 8 }}>
              Cliente desde {fmtData(dados.criadaEm)}
              {" · "}
              Última atualização {fmtData(dados.atualizadaEm)}
            </div>
          </div>

          {podeEditar && !editando && (
            <button
              onClick={() => setEditando(true)}
              style={{
                background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
                color: C.white, border: "none", borderRadius: 8,
                padding: "10px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >✏️ Editar identidade</button>
          )}
        </div>

        {/* Form de edicao inline */}
        {editando && (
          <form onSubmit={salvar} style={{
            background: C.surface, border: `1px solid ${C.border}`,
            borderRadius: 10, padding: 16, marginBottom: 16,
          }}>
            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
              <div>
                <label style={labelStyle}>Nome da empresa *</label>
                <input
                  value={nome}
                  onChange={e => setNome(e.target.value)}
                  maxLength={120}
                  required
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>CNPJ (opcional)</label>
                <input
                  value={cnpj}
                  onChange={e => setCnpj(mascararCnpj(e.target.value))}
                  placeholder="00.000.000/0000-00"
                  style={inputStyle}
                />
              </div>
            </div>
            {erroSalvar && (
              <div style={{
                marginTop: 10, padding: "8px 12px", borderRadius: 8,
                background: C.red + "22", border: `1px solid ${C.red}55`, color: C.red, fontSize: 12,
              }}>{erroSalvar}</div>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button type="submit" disabled={salvando} style={{
                background: C.green, color: C.white, border: "none", borderRadius: 8,
                padding: "8px 16px", fontWeight: 700, fontSize: 12, cursor: "pointer",
                opacity: salvando ? 0.6 : 1,
              }}>{salvando ? "Salvando..." : "💾 Salvar"}</button>
              <button type="button" onClick={cancelarEdicao} disabled={salvando} style={{
                background: C.surface, color: C.muted, border: `1px solid ${C.border}`,
                borderRadius: 8, padding: "8px 16px", fontWeight: 600, fontSize: 12, cursor: "pointer",
              }}>Cancelar</button>
            </div>
          </form>
        )}

        {/* Estatisticas */}
        <div style={{
          display: "grid", gap: 10, marginTop: 16,
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
        }}>
          {[
            { rotulo: "Usuários", valor: dados.estatisticas?.usuarios ?? 0, cor: C.accent },
            { rotulo: "Clientes", valor: dados.estatisticas?.clientes ?? 0, cor: C.green },
            { rotulo: "Produtos", valor: dados.estatisticas?.produtos ?? 0, cor: C.purple },
            { rotulo: "Vendas", valor: dados.estatisticas?.vendas ?? 0, cor: C.yellow },
          ].map((s, i) => (
            <div key={i} style={{
              background: C.surface, border: `1px solid ${C.border}`,
              borderRadius: 10, padding: "12px 14px", position: "relative", overflow: "hidden",
            }}>
              <div style={{ position: "absolute", top: 0, left: 0, width: 4, height: "100%", background: s.cor }} />
              <div style={{ color: C.muted, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
                {s.rotulo}
              </div>
              <div style={{ color: s.cor, fontSize: 22, fontWeight: 800, marginTop: 4 }}>
                {fmtNum(s.valor)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ============ BLOCO 2: DADOS FISCAIS (CONFIGURACAO EMPRESA) ============ */}
      <div style={{
        background: C.card, border: `1px solid ${C.border}`,
        borderRadius: 12, padding: 4, marginBottom: 20,
      }}>
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ color: C.white, fontSize: 14, fontWeight: 700 }}>
            📄 Dados fiscais e de exibição
          </div>
          <div style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>
            Esses dados aparecem em recibos, comprovantes e cabeçalhos de relatórios PDF.
          </div>
        </div>
        <div style={{ padding: 12 }}>
          <Configuracoes user={user} />
        </div>
      </div>
    </div>
  );
}

const labelStyle = {
  display: "block",
  color: C.muted, fontSize: 10, fontWeight: 700,
  textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4,
};

const inputStyle = {
  background: C.surface, border: `1px solid ${C.border}`,
  borderRadius: 8, padding: "8px 10px", color: C.text, fontSize: 13,
  outline: "none", width: "100%",
};

import { useEffect, useState } from "react";
import { C } from "./lib/theme.js";
import { api } from "./lib/api.js";
import { urlLogotipo } from "./Configuracoes.jsx";

// Cache em memoria — config da empresa muda raramente, mas mantemos um TTL
// curto para refletir alteracoes dentro da mesma sessao.
let cacheConfig = null;
let cacheTimestamp = 0;
const TTL_MS = 30_000;

export async function obterConfiguracaoCache() {
  const agora = Date.now();
  if (cacheConfig && (agora - cacheTimestamp) < TTL_MS) return cacheConfig;
  try {
    cacheConfig = await api.obterConfiguracao();
    cacheTimestamp = agora;
  } catch {
    cacheConfig = null;
  }
  return cacheConfig;
}

export function invalidarCacheConfiguracao() {
  cacheConfig = null;
  cacheTimestamp = 0;
}

// Hook para componentes — useEffect carrega da API/cache.
export function useConfiguracaoEmpresa() {
  const [cfg, setCfg] = useState(cacheConfig);
  useEffect(() => {
    let ativo = true;
    obterConfiguracaoCache().then(c => { if (ativo) setCfg(c); });
    return () => { ativo = false; };
  }, []);
  return cfg;
}

// Monta endereco completo formatado: "Av. X, 100 - Bairro, Cidade/UF · CEP".
export function formatarEndereco(cfg) {
  if (!cfg) return "";
  const partes = [];
  if (cfg.endereco) {
    let linha = cfg.endereco;
    if (cfg.numero) linha += `, ${cfg.numero}`;
    if (cfg.bairro) linha += ` - ${cfg.bairro}`;
    partes.push(linha);
  }
  const cidadeUf = [cfg.cidade, cfg.estado].filter(Boolean).join("/");
  if (cidadeUf) partes.push(cidadeUf);
  if (cfg.cep) partes.push(`CEP ${cfg.cep}`);
  return partes.join(" · ");
}

// HEADER PARA TELA (modo dark — usado em fechamento de caixa, etc).
//
// Variante "compacto" reduz tudo para uma unica linha — util em barras
// finas. "modoCupom" muda para fundo branco + texto preto (para impressao
// em cupom termico junto a window.print()).

export default function HeaderRelatorio({
  cfg: cfgProp = null,
  compacto = false,
  modoCupom = false,
}) {
  const cfgHook = useConfiguracaoEmpresa();
  const cfg = cfgProp || cfgHook;

  if (!cfg) return null;

  const corFundo = modoCupom ? "#ffffff" : C.surface;
  const corBorda = modoCupom ? "#000000" : C.border;
  const corTitulo = modoCupom ? "#000000" : C.white;
  const corTexto = modoCupom ? "#222222" : C.text;
  const corMuted = modoCupom ? "#444444" : C.muted;

  const logoUrl = urlLogotipo(cfg.logotipo);
  const endereco = formatarEndereco(cfg);

  if (compacto) {
    return (
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "8px 12px",
        background: corFundo, border: `1px solid ${corBorda}`, borderRadius: 8,
        fontSize: 11,
      }}>
        {logoUrl && <img src={logoUrl} alt="" style={{ height: 28, objectFit: "contain" }} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: corTitulo, fontWeight: 700, fontSize: 13 }}>
            {cfg.nomeFantasia || cfg.razaoSocial}
          </div>
          {(cfg.cnpj || cfg.telefone) && (
            <div style={{ color: corMuted, fontSize: 11 }}>
              {cfg.cnpj && `CNPJ ${cfg.cnpj}`}
              {cfg.cnpj && cfg.telefone && " · "}
              {cfg.telefone}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 14,
      padding: "12px 16px",
      background: corFundo, border: `1px solid ${corBorda}`, borderRadius: 10,
    }}>
      {logoUrl ? (
        <img src={logoUrl} alt="logotipo"
          style={{ height: 60, maxWidth: 140, objectFit: "contain", flexShrink: 0 }} />
      ) : (
        <div style={{
          width: 60, height: 60, borderRadius: 8, flexShrink: 0,
          background: modoCupom ? "#f0f0f0" : C.bg, border: `1px dashed ${corBorda}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: corMuted, fontSize: 24,
        }}>🏢</div>
      )}

      <div style={{ flex: 1, minWidth: 0, lineHeight: 1.4 }}>
        <div style={{ color: corTitulo, fontWeight: 800, fontSize: 16 }}>
          {cfg.nomeFantasia || cfg.razaoSocial}
        </div>
        {cfg.nomeFantasia && cfg.razaoSocial !== cfg.nomeFantasia && (
          <div style={{ color: corMuted, fontSize: 11 }}>{cfg.razaoSocial}</div>
        )}
        {endereco && (
          <div style={{ color: corTexto, fontSize: 12, marginTop: 2 }}>{endereco}</div>
        )}
        <div style={{ color: corMuted, fontSize: 11, marginTop: 2 }}>
          {cfg.cnpj && `CNPJ ${cfg.cnpj}`}
          {cfg.cnpj && (cfg.telefone || cfg.email) && " · "}
          {cfg.telefone && `Tel ${cfg.telefone}`}
          {cfg.telefone && cfg.email && " · "}
          {cfg.email}
        </div>
      </div>
    </div>
  );
}

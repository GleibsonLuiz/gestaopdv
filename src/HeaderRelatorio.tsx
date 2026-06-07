import { useEffect, useState } from "react";
import { C } from "./lib/theme";
import { api } from "./lib/api";
import { urlLogotipo, type ConfiguracaoEmpresa } from "./Configuracoes";

export type { ConfiguracaoEmpresa };

// Cache em memoria — config da empresa muda raramente, mas mantemos um TTL
// curto para refletir alteracoes dentro da mesma sessao.
let cacheConfig: ConfiguracaoEmpresa | null = null;
let cacheTimestamp = 0;
const TTL_MS = 30_000;

export async function obterConfiguracaoCache(): Promise<ConfiguracaoEmpresa | null> {
  const agora = Date.now();
  if (cacheConfig && (agora - cacheTimestamp) < TTL_MS) return cacheConfig;
  try {
    cacheConfig = (await api.obterConfiguracao()) as ConfiguracaoEmpresa;
    cacheTimestamp = agora;
  } catch {
    cacheConfig = null;
  }
  return cacheConfig;
}

export function invalidarCacheConfiguracao(): void {
  cacheConfig = null;
  cacheTimestamp = 0;
}

// Hook para componentes — useEffect carrega da API/cache.
export function useConfiguracaoEmpresa(): ConfiguracaoEmpresa | null {
  const [cfg, setCfg] = useState<ConfiguracaoEmpresa | null>(cacheConfig);
  useEffect(() => {
    let ativo = true;
    obterConfiguracaoCache().then((c) => { if (ativo) setCfg(c); });
    return () => { ativo = false; };
  }, []);
  return cfg;
}

// Monta endereco completo formatado: "Av. X, 100 - Bairro, Cidade/UF · CEP".
export function formatarEndereco(cfg: ConfiguracaoEmpresa | null | undefined): string {
  if (!cfg) return "";
  const partes: string[] = [];
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

interface HeaderRelatorioProps {
  cfg?: ConfiguracaoEmpresa | null;
  compacto?: boolean;
  modoCupom?: boolean;
}

export default function HeaderRelatorio({
  cfg: cfgProp = null,
  compacto = false,
  modoCupom = false,
}: HeaderRelatorioProps) {
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
      <div
        className="flex items-center gap-[10px] px-3 py-2 rounded-lg text-[11px]"
        style={{ background: corFundo, border: `1px solid ${corBorda}` }}
      >
        {logoUrl && <img src={logoUrl} alt="" className="h-7 object-contain" />}
        <div className="flex-1 min-w-0">
          <div className="font-bold text-[13px]" style={{ color: corTitulo }}>
            {cfg.nomeFantasia || cfg.razaoSocial}
          </div>
          {(cfg.cnpj || cfg.telefone) && (
            <div className="text-[11px]" style={{ color: corMuted }}>
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
    <div
      className="flex items-center justify-between gap-4 px-4 py-3 rounded-[10px]"
      style={{ background: corFundo, border: `1px solid ${corBorda}` }}
    >
      {logoUrl ? (
        <img
          src={logoUrl}
          alt="logotipo"
          className="h-[64px] max-w-[200px] object-contain object-left shrink-0"
        />
      ) : (
        <div
          className="w-[64px] h-[64px] rounded-lg shrink-0 flex items-center justify-center text-2xl"
          style={{
            background: modoCupom ? "#f0f0f0" : C.bg,
            border: `1px dashed ${corBorda}`,
            color: corMuted,
          }}
        >
          🏢
        </div>
      )}

      {/* Dados da empresa alinhados a DIREITA — logo de um lado, dados do
          outro (mesmo layout dos PDFs de relatorio). */}
      <div className="min-w-0 leading-[1.4] text-right">
        <div className="font-extrabold text-[16px]" style={{ color: corTitulo }}>
          {cfg.nomeFantasia || cfg.razaoSocial}
        </div>
        {cfg.nomeFantasia && cfg.razaoSocial !== cfg.nomeFantasia && (
          <div className="text-[11px]" style={{ color: corMuted }}>{cfg.razaoSocial}</div>
        )}
        {endereco && (
          <div className="text-xs mt-[2px]" style={{ color: corTexto }}>{endereco}</div>
        )}
        <div className="text-[11px] mt-[2px]" style={{ color: corMuted }}>
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

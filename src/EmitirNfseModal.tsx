import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { C } from "./lib/theme";
import { api } from "./lib/api";
import { emitirToast } from "./lib/toast";

// Modal compartilhado de emissao de NFS-e (servicos / ISS). Serve dois fluxos:
//  (a) a partir de uma Ordem de Servico (passa `ordemServico` com presets);
//  (b) avulsa/manual (sem ordemServico — o usuario digita tudo).
// A classificacao fiscal do servico (item LC 116, codigo do municipio, aliquota
// ISS) vem pre-preenchida do padrao da empresa (Config) e e editavel aqui.

type OSPreset = {
  id: string;
  numero?: number;
  tomadorNome?: string | null;
  tomadorCpfCnpj?: string | null;
  valorServicos?: number;
  discriminacao?: string;
};

type ConfigFiscal = {
  nfseAtivo?: boolean;
  itemListaServicoPadrao?: string | null;
  codTributacaoMunicipioPadrao?: string | null;
  aliquotaIssPadrao?: number | null;
  prontidaoNfse?: { pronta: boolean; faltando: string[] };
};

type NotaEmitida = {
  id: string;
  status: string;
  numeroNfse?: string | null;
  numeroFiscal?: number;
  xMotivo?: string | null;
};

export default function EmitirNfseModal({
  ordemServico,
  onFechar,
  onEmitida,
}: {
  ordemServico?: OSPreset;
  onFechar: () => void;
  onEmitida?: (nota: NotaEmitida) => void;
}) {
  const ehOS = !!ordemServico;
  const [carregandoConfig, setCarregandoConfig] = useState(true);
  const [config, setConfig] = useState<ConfigFiscal | null>(null);

  // Campos editaveis
  const [tomadorNome, setTomadorNome] = useState(ordemServico?.tomadorNome || "");
  const [tomadorCpfCnpj, setTomadorCpfCnpj] = useState(ordemServico?.tomadorCpfCnpj || "");
  const [valorServicos, setValorServicos] = useState(
    ordemServico?.valorServicos != null ? String(ordemServico.valorServicos) : ""
  );
  const [discriminacao, setDiscriminacao] = useState(ordemServico?.discriminacao || "");
  const [itemListaServico, setItemListaServico] = useState("");
  const [codTributacaoMunicipio, setCodTributacaoMunicipio] = useState("");
  const [aliquotaIss, setAliquotaIss] = useState("");
  const [issRetido, setIssRetido] = useState(false);

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [emitida, setEmitida] = useState<NotaEmitida | null>(null);

  useEffect(() => {
    api.obterConfigFiscal()
      .then((r) => {
        const c = r as ConfigFiscal;
        setConfig(c);
        setItemListaServico((v) => v || c.itemListaServicoPadrao || "");
        setCodTributacaoMunicipio((v) => v || c.codTributacaoMunicipioPadrao || "");
        setAliquotaIss((v) => v || (c.aliquotaIssPadrao != null ? String(c.aliquotaIssPadrao) : ""));
      })
      .catch((e: Error) => setErro(e.message))
      .finally(() => setCarregandoConfig(false));
  }, []);

  const issPrev = (() => {
    const v = Number(valorServicos), a = Number(aliquotaIss);
    if (!Number.isFinite(v) || !Number.isFinite(a) || v <= 0) return null;
    return (v * a) / 100;
  })();

  async function emitir() {
    setErro("");
    const v = Number(valorServicos);
    if (!Number.isFinite(v) || v <= 0) { setErro("Informe o valor do servico."); return; }
    if (!discriminacao.trim()) { setErro("Informe a discriminacao do servico."); return; }
    if (!itemListaServico.trim()) { setErro("Informe o item da lista de servicos (LC 116)."); return; }

    setSalvando(true);
    try {
      const body: Record<string, unknown> = {
        valorServicos: v,
        discriminacao: discriminacao.trim(),
        itemListaServico: itemListaServico.trim(),
        codTributacaoMunicipio: codTributacaoMunicipio.trim() || undefined,
        aliquotaIss: aliquotaIss === "" ? undefined : Number(aliquotaIss),
        issRetido,
      };
      if (ehOS) {
        body.ordemServicoId = ordemServico!.id;
      } else {
        body.tomadorNome = tomadorNome.trim() || undefined;
        body.tomadorCpfCnpj = tomadorCpfCnpj.replace(/\D/g, "") || undefined;
      }
      const r = await api.emitirNfse(body) as { nota: NotaEmitida; aviso?: string };
      const nota = r.nota;
      if (nota.status === "AUTORIZADA") {
        emitirToast({ tipo: "sucesso", titulo: "NFS-e autorizada", mensagem: `NFS-e ${nota.numeroNfse || nota.numeroFiscal || ""} emitida.` });
        setEmitida(nota);
        onEmitida?.(nota);
      } else if (nota.status === "PROCESSANDO" || nota.status === "PENDENTE") {
        emitirToast({ tipo: "info", titulo: "NFS-e enviada", mensagem: r.aviso || "Aguardando confirmacao do provedor." });
        setEmitida(nota);
        onEmitida?.(nota);
      } else {
        setErro(nota.xMotivo || `NFS-e ${nota.status}.`);
        onEmitida?.(nota);
      }
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  async function abrirDanfse() {
    if (!emitida) return;
    try { await api.abrirPdfNfse(emitida.id); }
    catch (e) { emitirToast({ tipo: "erro", titulo: "Erro", mensagem: (e as Error).message }); }
  }

  const nfseIndisponivel = !carregandoConfig && config && !config.nfseAtivo;

  return (
    <div style={modalBg} onClick={onFechar}>
      <div style={modalBox} onClick={(e) => e.stopPropagation()}>
        <div className="text-gp-white font-bold text-[15px] mb-1">
          🧾 Emitir NFS-e {ehOS && ordemServico?.numero ? `— OS nº ${ordemServico.numero}` : "avulsa"}
        </div>
        <div className="text-gp-muted text-[12px] mb-3">
          Nota fiscal de serviço eletrônica (ISS, municipal). A classificação vem do padrão da empresa e pode ser ajustada.
        </div>

        {erro && <div style={alerta(C.red)}>{erro}</div>}
        {nfseIndisponivel && (
          <div style={alerta(C.yellow)}>
            A emissão de NFS-e ainda não está ativa. Configure em <b>Configurações &gt; Emissão Fiscal</b>
            {config?.prontidaoNfse?.faltando?.length ? `: faltam ${config.prontidaoNfse.faltando.join(", ")}.` : "."}
          </div>
        )}

        {emitida ? (
          <div>
            <div style={alerta(emitida.status === "AUTORIZADA" ? C.green : C.yellow)}>
              {emitida.status === "AUTORIZADA"
                ? `NFS-e ${emitida.numeroNfse || ""} autorizada com sucesso.`
                : `NFS-e ${emitida.status.toLowerCase()} — consulte o status em instantes.`}
            </div>
            <div className="flex justify-end gap-2 mt-3">
              {emitida.status === "AUTORIZADA" && (
                <button onClick={abrirDanfse} style={btnPrimario}>📄 Abrir DANFSE (PDF)</button>
              )}
              <button onClick={onFechar} style={btnGhost}>Fechar</button>
            </div>
          </div>
        ) : (
          <>
            {ehOS ? (
              <div className="text-gp-text text-[12px] mb-2">
                <span className="text-gp-muted">Tomador:</span>{" "}
                {ordemServico?.tomadorNome || <span className="text-gp-muted">não identificado</span>}
                {ordemServico?.tomadorCpfCnpj ? ` (${ordemServico.tomadorCpfCnpj})` : ""}
              </div>
            ) : (
              <div className="grid gap-2 mb-2" style={{ gridTemplateColumns: "1.3fr 1fr" }}>
                <Campo label="Tomador (nome)">
                  <input value={tomadorNome} onChange={(e) => setTomadorNome(e.target.value)} placeholder="Nome do cliente" style={inputBase} />
                </Campo>
                <Campo label="CPF/CNPJ do tomador">
                  <input value={tomadorCpfCnpj} onChange={(e) => setTomadorCpfCnpj(e.target.value)} placeholder="Opcional" style={inputBase} />
                </Campo>
              </div>
            )}

            <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <Campo label="Valor do serviço (R$)">
                <input value={valorServicos} onChange={(e) => setValorServicos(e.target.value.replace(",", "."))} placeholder="0.00" inputMode="decimal" style={inputBase} />
              </Campo>
              <Campo label="ISS estimado">
                <div style={{ ...inputBase, display: "flex", alignItems: "center", color: C.muted }}>
                  {issPrev != null ? `R$ ${issPrev.toFixed(2)}` : "—"}
                </div>
              </Campo>
            </div>

            <div className="mt-2">
              <Campo label="Discriminação do serviço">
                <textarea value={discriminacao} onChange={(e) => setDiscriminacao(e.target.value)} rows={2} placeholder="Descrição do serviço prestado" style={{ ...inputBase, resize: "vertical", fontFamily: "inherit" }} />
              </Campo>
            </div>

            <div className="grid gap-2 mt-2" style={{ gridTemplateColumns: "1fr 1fr 0.8fr" }}>
              <Campo label="Item LC 116">
                <input value={itemListaServico} onChange={(e) => setItemListaServico(e.target.value)} placeholder="ex: 1401" style={inputBase} />
              </Campo>
              <Campo label="Cód. trib. município">
                <input value={codTributacaoMunicipio} onChange={(e) => setCodTributacaoMunicipio(e.target.value)} placeholder="Opcional" style={inputBase} />
              </Campo>
              <Campo label="Alíquota ISS (%)">
                <input value={aliquotaIss} onChange={(e) => setAliquotaIss(e.target.value.replace(",", "."))} placeholder="0.00" inputMode="decimal" style={inputBase} />
              </Campo>
            </div>

            <label className="flex items-center gap-2 mt-2 text-gp-text text-[12px] cursor-pointer">
              <input type="checkbox" checked={issRetido} onChange={(e) => setIssRetido(e.target.checked)} />
              ISS retido pelo tomador
            </label>

            <div className="flex justify-end gap-2 mt-3">
              <button onClick={onFechar} style={btnGhost}>Cancelar</button>
              <button onClick={emitir} disabled={salvando || carregandoConfig || !!nfseIndisponivel} style={btnPrimario}>
                {salvando ? "Emitindo…" : "Emitir NFS-e"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="block text-gp-muted text-[11px] mb-1 font-semibold">{label}</label>
      {children}
    </div>
  );
}

function alerta(cor: string): CSSProperties {
  return { marginBottom: 12, padding: "10px 14px", borderRadius: 8, background: cor + "22", border: `1px solid ${cor}55`, color: cor, fontSize: 12 };
}
const inputBase: CSSProperties = { width: "100%", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 10px", color: C.text, fontSize: 13, outline: "none", boxSizing: "border-box" };
const btnGhost: CSSProperties = { background: C.surface, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: "7px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" };
const btnPrimario: CSSProperties = { background: C.accent, border: `1px solid ${C.accent}`, color: "#0b0f17", borderRadius: 8, padding: "7px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" };
const modalBg: CSSProperties = { position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 };
const modalBox: CSSProperties = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20, width: "min(560px, calc(100vw - 32px))", maxHeight: "calc(100vh - 32px)", overflowY: "auto" };

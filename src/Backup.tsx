import { useMemo, useState } from "react";
import { C } from "./lib/theme";
import { api, getEmpresa, type SessionUser } from "./lib/api";
import { fmtDataHora, fmtTamanho } from "./lib/format";


// Palavra-chave conforme backupController.PALAVRA_CHAVE_RESTORE — precisa
// bater exatamente. Exposta aqui para o usuario digitar antes de liberar
// o botao de restaurar (mesmo padrao do Sistema/Reset).
const PALAVRA_CHAVE = "CONFIRMAR_RESTORE";

// Tipo do payload retornado por /backup/exportar (vem do backupController).
interface BackupPayload {
  versao: string;
  exportadoEm: string;
  exportadoPor?: { id: string; nome: string | null };
  contagem: Record<string, number>;
  dados: Record<string, unknown>;
}

interface BackupProps {
  user: SessionUser;
}

export default function Backup({ user }: BackupProps) {
  if (user.role !== "ADMIN") {
    return (
      <div className="bg-gp-card border border-gp-border rounded-xl p-[30px] text-center text-gp-muted text-sm">
        🔒 Apenas administradores podem acessar esta área.
      </div>
    );
  }

  return (
    <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))" }}>
      <CardExportar />
      <CardRestaurar />
    </div>
  );
}

// =============================================================================
// CARD: Fazer backup
// =============================================================================
//
// Botao unico "Baixar backup agora". Apos sucesso, mostra contagem por tabela
// e dispara download de um arquivo JSON nomeado por data.

function CardExportar() {
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [resultado, setResultado] = useState<BackupPayload | null>(null);
  const empresa = getEmpresa();

  async function executar() {
    setErro("");
    setCarregando(true);
    try {
      const r = (await api.exportarBackup()) as BackupPayload;
      setResultado(r);
      // Dispara download imediatamente apos receber o JSON.
      baixarArquivo(r, nomeArquivoBackup(empresa?.nome));
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div
      className="rounded-[14px] p-[22px]"
      style={{ background: C.accent + "0d", border: `2px solid ${C.accent}55` }}
    >
      <div className="flex items-center gap-3 mb-[14px]">
        <div className="text-[28px]">💾</div>
        <div className="flex-1">
          <div className="font-extrabold text-lg leading-[1.1]" style={{ color: C.accent }}>
            Fazer backup
          </div>
          <div className="text-gp-muted text-xs mt-1">
            Baixa um arquivo <code>.json</code> com todos os dados operacionais
            {empresa?.nome ? ` da empresa "${empresa.nome}"` : " da sua empresa"}.
          </div>
        </div>
      </div>

      <div
        className="bg-gp-bg border border-gp-border rounded-[10px] p-[14px] mb-4 text-[12.5px] text-gp-text leading-[1.6]"
      >
        <strong className="text-gp-text">O que é salvo:</strong> clientes, fornecedores, produtos,
        categorias, vendas, compras, contas a pagar/receber, estoque, caixas, anexos, orçamentos,
        configuração da empresa e usuários. Guarde o arquivo em local seguro
        (Google Drive, OneDrive, pen drive externo).
      </div>

      <button
        onClick={executar}
        disabled={carregando}
        className="text-gp-white rounded-[10px] px-[22px] py-3 font-extrabold text-sm tracking-[0.3px]"
        style={{
          background: carregando ? C.surface : C.accent,
          border: `1px solid ${C.accent}`,
          color: carregando ? C.muted : C.white,
          boxShadow: carregando ? "none" : `0 4px 14px ${C.accent}55`,
          cursor: carregando ? "wait" : "pointer",
        }}
      >
        {carregando ? "⏳ Gerando backup..." : "⬇ Baixar backup agora"}
      </button>

      {erro && (
        <div
          className="mt-3 px-3 py-[10px] rounded-lg text-gp-red text-[13px]"
          style={{ background: C.red + "22", border: `1px solid ${C.red}55` }}
        >
          {erro}
        </div>
      )}

      {resultado && (
        <div
          className="mt-4 rounded-[10px] p-[14px] text-[12.5px]"
          style={{ background: C.green + "11", border: `1px solid ${C.green}55` }}
        >
          <div className="font-extrabold mb-2" style={{ color: C.green }}>
            ✓ Backup gerado e baixado
          </div>
          <div className="text-gp-muted text-[11px] mb-2">
            Versão {resultado.versao} · {fmtDataHora(resultado.exportadoEm)}
          </div>
          <ListaContagens contagem={resultado.contagem} />
        </div>
      )}
    </div>
  );
}

// =============================================================================
// CARD: Restaurar backup
// =============================================================================
//
// Fluxo:
//   1. Usuario seleciona/arrasta arquivo .json
//   2. Lemos no front e mostramos contagem (preview)
//   3. Botao vermelho abre modal de confirmacao com palavra-chave
//   4. POST /backup/restaurar com o JSON e a palavra-chave

function CardRestaurar() {
  const [arquivo, setArquivo] = useState<{ nome: string; tamanho: number; payload: BackupPayload } | null>(null);
  const [erroLeitura, setErroLeitura] = useState("");
  const [arrastando, setArrastando] = useState(false);
  const [modalAberto, setModalAberto] = useState(false);
  const [resultado, setResultado] = useState<{
    restaurados: Record<string, number>;
    exportadoEm: string;
  } | null>(null);

  async function processarArquivo(f: File) {
    setErroLeitura("");
    setResultado(null);
    if (!f.name.toLowerCase().endsWith(".json")) {
      setErroLeitura("O arquivo precisa ter extensão .json");
      return;
    }
    try {
      const texto = await f.text();
      const json = JSON.parse(texto);
      if (!json.versao || !json.dados || !json.contagem) {
        setErroLeitura("Arquivo não parece ser um backup válido (faltam campos versao/dados/contagem)");
        return;
      }
      setArquivo({ nome: f.name, tamanho: f.size, payload: json });
    } catch (err) {
      setErroLeitura("Falha ao ler arquivo: " + (err as Error).message);
    }
  }

  function onChangeInput(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) processarArquivo(f);
    // Limpa o input para permitir re-selecionar o mesmo arquivo
    e.target.value = "";
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setArrastando(false);
    const f = e.dataTransfer.files?.[0];
    if (f) processarArquivo(f);
  }

  return (
    <div
      className="rounded-[14px] p-[22px]"
      style={{ background: C.red + "11", border: `2px solid ${C.red}55` }}
    >
      <div className="flex items-center gap-3 mb-[14px]">
        <div className="text-[28px]">♻️</div>
        <div className="flex-1">
          <div className="font-extrabold text-lg leading-[1.1] text-gp-red">
            Restaurar backup
          </div>
          <div className="text-gp-muted text-xs mt-1">
            Restaura todos os dados a partir de um arquivo <code>.json</code> gerado anteriormente.
            <strong className="text-gp-red"> Sobrescreve tudo.</strong>
          </div>
        </div>
      </div>

      {!arquivo ? (
        <div
          onClick={() => document.getElementById("backup-file-input")?.click()}
          onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
          onDragLeave={() => setArrastando(false)}
          onDrop={onDrop}
          className="rounded-[10px] p-[28px] text-center cursor-pointer transition-colors"
          style={{
            background: arrastando ? C.accent + "22" : C.bg,
            border: `2px dashed ${arrastando ? C.accent : C.border}`,
          }}
        >
          <div className="text-[32px] mb-2">📂</div>
          <div className="font-bold text-sm text-gp-text mb-1">
            Clique para escolher um arquivo ou arraste aqui
          </div>
          <div className="text-gp-muted text-[11px]">Apenas .json gerados pelo botão "Baixar backup agora"</div>
          <input
            id="backup-file-input"
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={onChangeInput}
          />
        </div>
      ) : (
        <div
          className="rounded-[10px] p-[14px]"
          style={{ background: C.bg, border: `1px solid ${C.border}` }}
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="text-[24px]">📄</div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm text-gp-text truncate">{arquivo.nome}</div>
              <div className="text-gp-muted text-[11px]">
                {fmtTamanho(arquivo.tamanho)} · versão {arquivo.payload.versao} ·{" "}
                {fmtDataHora(arquivo.payload.exportadoEm)}
              </div>
            </div>
            <button
              onClick={() => setArquivo(null)}
              className="text-gp-muted text-[12px] px-2 py-1 rounded hover:bg-gp-card cursor-pointer"
              style={{ background: "transparent", border: `1px solid ${C.border}` }}
              title="Trocar arquivo"
            >
              Trocar
            </button>
          </div>
          <div className="text-gp-muted text-[11px] font-bold uppercase mb-1 tracking-[0.5px]">
            Conteúdo do arquivo
          </div>
          <ListaContagens contagem={arquivo.payload.contagem} />
        </div>
      )}

      {erroLeitura && (
        <div
          className="mt-3 px-3 py-[10px] rounded-lg text-gp-red text-[13px]"
          style={{ background: C.red + "22", border: `1px solid ${C.red}55` }}
        >
          {erroLeitura}
        </div>
      )}

      <button
        onClick={() => arquivo && setModalAberto(true)}
        disabled={!arquivo}
        className="mt-4 w-full rounded-[10px] px-[22px] py-3 font-extrabold text-sm tracking-[0.3px]"
        style={{
          background: arquivo ? C.red : C.surface,
          color: arquivo ? C.white : C.muted,
          border: `1px solid ${arquivo ? C.red : C.border}`,
          cursor: arquivo ? "pointer" : "not-allowed",
          boxShadow: arquivo ? `0 4px 14px ${C.red}55` : "none",
        }}
      >
        ♻ Restaurar agora — sobrescrever todos os dados
      </button>

      {resultado && (
        <div
          className="mt-4 rounded-[10px] p-[14px] text-[12.5px]"
          style={{ background: C.green + "11", border: `1px solid ${C.green}55` }}
        >
          <div className="font-extrabold mb-2" style={{ color: C.green }}>
            ✓ Restauração concluída
          </div>
          <div className="text-gp-muted text-[11px] mb-2">
            Backup de {fmtDataHora(resultado.exportadoEm)}
          </div>
          <ListaContagens contagem={resultado.restaurados} />
        </div>
      )}

      {modalAberto && arquivo && (
        <ModalRestaurar
          arquivo={arquivo}
          onCancelar={() => setModalAberto(false)}
          onConcluir={(resumo) => {
            setModalAberto(false);
            setResultado(resumo);
            setArquivo(null);
          }}
        />
      )}
    </div>
  );
}

// =============================================================================
// Modal de confirmacao do restore
// =============================================================================

interface ModalRestaurarProps {
  arquivo: { nome: string; payload: BackupPayload };
  onCancelar: () => void;
  onConcluir: (resumo: { restaurados: Record<string, number>; exportadoEm: string }) => void;
}

function ModalRestaurar({ arquivo, onCancelar, onConcluir }: ModalRestaurarProps) {
  const [texto, setTexto] = useState("");
  const [executando, setExecutando] = useState(false);
  const [erro, setErro] = useState("");

  const habilitado = useMemo(
    () => texto === PALAVRA_CHAVE && !executando,
    [texto, executando],
  );

  async function executar() {
    if (!habilitado) return;
    setErro("");
    setExecutando(true);
    try {
      const resp = (await api.restaurarBackup(PALAVRA_CHAVE, arquivo.payload)) as {
        ok: boolean;
        restaurados: Record<string, number>;
        exportadoEm: string;
      };
      onConcluir({ restaurados: resp.restaurados, exportadoEm: resp.exportadoEm });
    } catch (err) {
      setErro((err as Error).message);
      setExecutando(false);
    }
  }

  return (
    <div
      onClick={() => !executando && onCancelar()}
      className="fixed inset-0 bg-black/75 flex items-center justify-center p-5 z-[200]"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-gp-card rounded-[14px] w-full max-w-[520px] max-h-[90vh] overflow-y-auto p-7"
        style={{ border: `2px solid ${C.red}` }}
      >
        <div className="text-center mb-[18px]">
          <div className="text-[42px] leading-none">⚠</div>
          <div className="text-gp-red font-extrabold text-xl mt-[10px]">CONFIRMAÇÃO CRÍTICA</div>
          <div className="text-gp-muted text-[13px] mt-[6px]">
            Você está prestes a SOBRESCREVER todos os dados atuais
            com o conteúdo de <strong className="text-gp-text">{arquivo.nome}</strong>.
          </div>
        </div>

        <div
          className="rounded-[10px] px-[14px] py-3 mb-4 text-gp-text text-[13px] leading-[1.5]"
          style={{ background: C.red + "11", border: `1px solid ${C.red}55` }}
        >
          Esta ação é <strong className="text-gp-red">IRREVERSÍVEL</strong>. Vendas, caixas,
          compras, estoque, financeiro, cadastros (clientes, fornecedores, produtos, categorias),
          anexos e orçamentos serão substituídos pelos dados do backup. Seu usuário será preservado
          para você não perder acesso ao sistema.
        </div>

        <div className="text-gp-muted text-xs font-semibold mb-[6px]">
          Para habilitar o botão, digite{" "}
          <code className="bg-gp-surface text-gp-red px-[6px] py-[2px] rounded font-bold">
            {PALAVRA_CHAVE}
          </code>
          {" "}exatamente:
        </div>
        <input
          type="text"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          disabled={executando}
          autoFocus
          spellCheck={false}
          autoComplete="off"
          placeholder={PALAVRA_CHAVE}
          className="w-full box-border bg-gp-surface rounded-lg px-[14px] py-[10px] text-sm font-bold outline-none tracking-[1px] font-mono"
          style={{
            border: `2px solid ${texto === PALAVRA_CHAVE ? C.red : C.border}`,
            color: texto === PALAVRA_CHAVE ? C.red : C.text,
          }}
        />

        {erro && (
          <div
            className="mt-3 px-3 py-[10px] rounded-lg text-gp-red text-[13px]"
            style={{ background: C.red + "22", border: `1px solid ${C.red}55` }}
          >
            {erro}
          </div>
        )}

        <div className="flex gap-[10px] mt-[22px]">
          <button
            type="button"
            onClick={onCancelar}
            disabled={executando}
            className="flex-1 bg-gp-surface border border-gp-border text-gp-text rounded-lg px-[18px] py-3 font-bold text-[13px]"
            style={{ cursor: executando ? "default" : "pointer" }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={executar}
            disabled={!habilitado}
            className="flex-1 rounded-lg px-[18px] py-3 font-extrabold text-[13px] tracking-[0.3px]"
            style={{
              background: habilitado ? C.red : C.surface,
              color: habilitado ? C.white : C.muted,
              border: `1px solid ${habilitado ? C.red : C.border}`,
              cursor: habilitado ? "pointer" : "not-allowed",
              boxShadow: habilitado ? `0 4px 14px ${C.red}55` : "none",
            }}
          >
            {executando ? "♻ Restaurando..." : "♻ Confirmar restauração"}
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Helpers visuais
// =============================================================================

function ListaContagens({ contagem }: { contagem: Record<string, number> }) {
  const entradas = Object.entries(contagem).filter(([, v]) => typeof v === "number");
  if (entradas.length === 0) {
    return <div className="text-gp-muted text-[12px]">Sem dados.</div>;
  }
  return (
    <div className="grid gap-[6px]" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
      {entradas.map(([chave, qtd]) => (
        <div key={chave} className="flex justify-between items-baseline gap-2 text-[12px]">
          <span className="text-gp-muted capitalize">{rotuloAmigavel(chave)}</span>
          <span className="font-bold text-gp-text font-mono">{qtd.toLocaleString("pt-BR")}</span>
        </div>
      ))}
    </div>
  );
}

function rotuloAmigavel(chave: string): string {
  const mapa: Record<string, string> = {
    users: "Usuários",
    clientes: "Clientes",
    fornecedores: "Fornecedores",
    produtos: "Produtos",
    categorias: "Categorias",
    vendas: "Vendas",
    compras: "Compras",
    contasPagar: "Contas a pagar",
    contasReceber: "Contas a receber",
    orcamentos: "Orçamentos",
    caixas: "Caixas",
    movimentacoesEstoque: "Mov. estoque",
    movimentacoesCaixa: "Mov. caixa",
    anexos: "Anexos",
    itensVenda: "Itens de venda",
    itensCompra: "Itens de compra",
    itensOrcamento: "Itens de orçamento",
    formaPagamentoCustom: "Formas pagto.",
  };
  return mapa[chave] || chave;
}

function nomeArquivoBackup(nomeEmpresa: string | undefined | null): string {
  const dataYMD = new Date().toISOString().slice(0, 10);
  const slug = (nomeEmpresa || "gestaopro")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `backup-${slug}-${dataYMD}.json`;
}

// Cria um Blob com o JSON e dispara o download via anchor invisivel.
// createObjectURL retorna uma URL local que aponta para o blob em memoria;
// revogamos depois para liberar.
function baixarArquivo(payload: BackupPayload, nomeArquivo: string) {
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

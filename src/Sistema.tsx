import { useMemo, useState } from "react";
import { C } from "./lib/theme";
import { api, getEmpresa, type SessionEmpresa, type SessionUser } from "./lib/api";


const PALAVRA_CHAVE = "CONFIRMAR_RESET";

interface GrupoLimpo {
  titulo: string;
  itens: [string, string][];
}

// Lista organizada em grupos. Cada item reflete uma ou mais tabelas que
// o adminController.resetarSistema apaga via deleteMany() (todas filtradas
// automaticamente por tenant pelo Prisma Extension).
const GRUPOS_LIMPOS: GrupoLimpo[] = [
  {
    titulo: "Operacional",
    itens: [
      ["🛒", "Vendas e itens de venda"],
      ["📋", "Orçamentos e ordens de serviço"],
      ["💵", "Caixas (abertura/fechamento + extrato)"],
      ["🔄", "Movimentações de caixa (sangria, suprimento, estorno)"],
      ["🛍", "Compras e itens de compra"],
      ["📊", "Movimentações de estoque"],
      ["📎", "Anexos (PDF/imagens) do financeiro"],
      ["💸", "Contas a pagar e a receber"],
    ],
  },
  {
    titulo: "Cadastros",
    itens: [
      ["📦", "Produtos (incluindo serviços e fotos)"],
      ["🏷", "Categorias"],
      ["🏭", "Fornecedores"],
      ["👥", "Clientes (e seus contatos B2B)"],
      ["💳", "Formas de pagamento personalizadas"],
    ],
  },
  {
    titulo: "CRM",
    itens: [
      ["🎯", "Oportunidades + histórico (funil de vendas)"],
      ["✅", "Tarefas e follow-ups"],
      ["💬", "Interações com clientes (ligações, WhatsApp, etc.)"],
      ["🏷️", "Tags de clientes"],
      ["📨", "Templates de mensagem (WhatsApp/Email/SMS)"],
      ["⚡", "Regras de automação + logs de execução"],
      ["⭐", "Pesquisas NPS e respostas"],
    ],
  },
  {
    titulo: "Fidelidade",
    itens: [
      ["💎", "Pontos de cliente e movimentações"],
      ["⚙️", "Configuração do programa de fidelidade"],
    ],
  },
];

const PRESERVADOS: [string, string][] = [
  ["🧑‍💼", "Funcionários da empresa (incluindo você)"],
  ["🏆", "Configurações de comissão dos vendedores"],
  ["🔐", "Permissões e perfis (ADMIN/GERENTE/VENDEDOR)"],
  ["🏢", "Identidade da empresa (nome, CNPJ, status)"],
  ["📄", "Dados fiscais e de exibição (razão social, endereço, etc.)"],
  ["🖼", "Logotipo da empresa"],
  ["📜", "Logs de auditoria (histórico de ações)"],
];

interface SistemaProps {
  user: SessionUser;
  onResetar?: (resumo: unknown) => void;
}

export default function Sistema({ user, onResetar }: SistemaProps) {
  const [modalAberto, setModalAberto] = useState(false);
  const empresa = getEmpresa();

  if (user.role !== "ADMIN") {
    return (
      <div className="bg-gp-card border border-gp-border rounded-xl p-[30px] text-center text-gp-muted text-sm">
        🔒 Apenas administradores podem acessar esta área.
      </div>
    );
  }

  return (
    <div>
      <div
        className="rounded-[14px] p-[22px] mb-4"
        style={{ background: C.red + "11", border: `2px solid ${C.red}55` }}
      >
        <div className="flex items-center gap-3 mb-[14px]">
          <div className="text-[28px]">🚨</div>
          <div className="flex-1">
            <div className="font-extrabold text-lg leading-[1.1] text-gp-red">
              Zona de Perigo — Reset dos dados da empresa
            </div>
            <div className="text-gp-muted text-xs mt-1">
              Apaga TODOS os dados operacionais e de CRM apenas da sua empresa
              {empresa?.nome ? ` (${empresa.nome})` : ""}. Outras empresas no sistema não são afetadas.
            </div>
          </div>
        </div>

        {/* Esclarecimento multi-tenant */}
        <div
          className="rounded-[10px] px-[14px] py-[10px] mb-4 text-gp-text text-xs leading-[1.5]"
          style={{ background: C.accent + "11", border: `1px solid ${C.accent}55` }}
        >
          🏢 <strong>Escopo:</strong> esta operação afeta APENAS o tenant logado
          {empresa?.nome ? ` — "${empresa.nome}"` : ""}. O isolamento multi-tenant garante que
          dados de outras empresas no mesmo sistema permanecem intocados.
        </div>

        <div
          className="bg-gp-bg border border-gp-border rounded-[10px] p-[18px] grid gap-[18px]"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}
        >
          {/* Coluna 1: Será apagado, com sub-grupos */}
          <div>
            <div className="text-gp-red text-[11px] font-bold mb-[10px] uppercase tracking-[0.5px]">
              ⚠ Será apagado (apenas da sua empresa)
            </div>
            {GRUPOS_LIMPOS.map((grupo) => (
              <div key={grupo.titulo} className="mb-3">
                <div
                  className="text-gp-muted text-[10px] font-bold uppercase tracking-[0.5px] mb-1 mt-1 pb-[2px]"
                  style={{ borderBottom: `1px solid ${C.border}55` }}
                >
                  {grupo.titulo}
                </div>
                {grupo.itens.map(([icone, nome]) => (
                  <div key={nome} className="text-gp-text text-[12.5px] py-[3px] flex items-center gap-2">
                    <span className="w-5 shrink-0">{icone}</span>
                    <span>{nome}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Coluna 2: Preservado */}
          <div>
            <div className="text-gp-green text-[11px] font-bold mb-[10px] uppercase tracking-[0.5px]">
              ✓ Preservado
            </div>
            {PRESERVADOS.map(([icone, nome]) => (
              <div key={nome} className="text-gp-text text-[12.5px] py-[5px] flex items-center gap-2">
                <span className="w-5 shrink-0">{icone}</span>
                <span>{nome}</span>
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={() => setModalAberto(true)}
          className="mt-[18px] text-gp-white rounded-[10px] px-[22px] py-3 font-extrabold text-sm cursor-pointer tracking-[0.3px]"
          style={{
            background: C.red,
            border: `1px solid ${C.red}`,
            boxShadow: `0 4px 14px ${C.red}55`,
          }}
        >
          🗑 RESET TOTAL DOS DADOS DESTA EMPRESA
        </button>
      </div>

      {modalAberto && (
        <ModalReset
          empresa={empresa}
          onCancelar={() => setModalAberto(false)}
          onConcluir={(resumo) => {
            setModalAberto(false);
            onResetar?.(resumo);
          }}
        />
      )}
    </div>
  );
}

interface ModalResetProps {
  empresa: SessionEmpresa | null;
  onCancelar: () => void;
  onConcluir: (resumo: unknown) => void;
}

function ModalReset({ empresa, onCancelar, onConcluir }: ModalResetProps) {
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
      const resp = await api.resetarSistema(PALAVRA_CHAVE);
      onConcluir(resp);
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
            Você está prestes a apagar TODOS os dados operacionais e de CRM
            {empresa?.nome ? ` da empresa "${empresa.nome}"` : " da sua empresa"}.
          </div>
        </div>

        <div
          className="rounded-[10px] px-[14px] py-3 mb-4 text-gp-text text-[13px] leading-[1.5]"
          style={{ background: C.red + "11", border: `1px solid ${C.red}55` }}
        >
          Esta ação é <strong className="text-gp-red">IRREVERSÍVEL</strong>.
          Vendas, caixas, compras, estoque, financeiro, cadastros (clientes,
          fornecedores, produtos, categorias), formas de pagamento personalizadas
          e todos os dados de CRM (funil, tarefas, interações, NPS, automações,
          tags, templates) serão apagados permanentemente. Os funcionários, comissões,
          permissões, identidade da empresa, logotipo e logs de auditoria serão preservados.
          {empresa?.nome ? ` Outras empresas no sistema NÃO são afetadas.` : ""}
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
            {executando ? "🗑 Apagando..." : "🗑 Executar Reset"}
          </button>
        </div>
      </div>
    </div>
  );
}

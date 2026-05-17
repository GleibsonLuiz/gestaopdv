import { useState, type FormEvent, type ReactNode } from "react";
import { C } from "./lib/theme";
import { api } from "./lib/api";

interface TrocarSenhaModalProps {
  onFechar: () => void;
}

export default function TrocarSenhaModal({ onFechar }: TrocarSenhaModalProps) {
  const [senhaAtual, setSenhaAtual] = useState("");
  const [senhaNova, setSenhaNova] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [sucesso, setSucesso] = useState(false);

  async function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro("");
    if (!senhaAtual || !senhaNova) {
      setErro("Preencha todos os campos");
      return;
    }
    if (senhaNova.length < 6) {
      setErro("A nova senha deve ter pelo menos 6 caracteres");
      return;
    }
    if (senhaNova === senhaAtual) {
      setErro("A nova senha deve ser diferente da atual");
      return;
    }
    if (senhaNova !== confirmar) {
      setErro("A confirmação não confere com a nova senha");
      return;
    }

    setSalvando(true);
    try {
      await api.trocarSenha(senhaAtual, senhaNova);
      setSucesso(true);
      setTimeout(() => onFechar(), 1500);
    } catch (err) {
      setErro((err as Error).message || "Falha ao trocar senha");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div
      onClick={() => !salvando && onFechar()}
      className="fixed inset-0 bg-black/65 flex items-center justify-center p-5 z-[100]"
    >
      <form
        onSubmit={salvar}
        onClick={(e) => e.stopPropagation()}
        className="bg-gp-card border border-gp-border rounded-[14px] w-full max-w-[420px] p-6"
      >
        <div className="flex justify-between items-start mb-[18px]">
          <div>
            <div className="text-gp-white font-bold text-lg">🔐 Trocar senha</div>
            <div className="text-gp-muted text-xs mt-[2px]">
              Defina uma nova senha de acesso
            </div>
          </div>
          <button
            type="button"
            onClick={onFechar}
            disabled={salvando}
            className="bg-transparent border-none text-gp-muted text-[22px] cursor-pointer"
          >
            ×
          </button>
        </div>

        {sucesso ? (
          <div
            className="px-[14px] py-4 rounded-lg text-sm font-semibold text-center text-gp-green"
            style={{
              background: C.green + "22",
              border: `1px solid ${C.green}55`,
            }}
          >
            ✓ Senha alterada com sucesso
          </div>
        ) : (
          <>
            <Campo label="Senha atual *">
              <input
                type="password"
                value={senhaAtual}
                autoFocus
                onChange={(e) => setSenhaAtual(e.target.value)}
                required
                className="w-full bg-gp-surface border border-gp-border rounded-lg px-3 py-[10px] text-gp-text text-sm outline-none box-border"
              />
            </Campo>
            <Campo label="Nova senha *">
              <input
                type="password"
                value={senhaNova}
                onChange={(e) => setSenhaNova(e.target.value)}
                required
                minLength={6}
                placeholder="Mínimo 6 caracteres"
                className="w-full bg-gp-surface border border-gp-border rounded-lg px-3 py-[10px] text-gp-text text-sm outline-none box-border"
              />
            </Campo>
            <Campo label="Confirmar nova senha *">
              <input
                type="password"
                value={confirmar}
                onChange={(e) => setConfirmar(e.target.value)}
                required
                className="w-full bg-gp-surface border border-gp-border rounded-lg px-3 py-[10px] text-gp-text text-sm outline-none box-border"
              />
            </Campo>

            {erro && (
              <div
                className="mt-2 px-3 py-[10px] rounded-lg text-gp-red text-[13px]"
                style={{
                  background: C.red + "22",
                  border: `1px solid ${C.red}55`,
                }}
              >
                {erro}
              </div>
            )}

            <div className="flex gap-[10px] justify-end mt-[18px]">
              <button
                type="button"
                onClick={onFechar}
                disabled={salvando}
                className="bg-gp-surface border border-gp-border text-gp-text rounded-lg px-[18px] py-[10px] font-semibold text-[13px] cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={salvando}
                className="text-gp-white border-none rounded-lg px-[22px] py-[10px] font-bold text-[13px] cursor-pointer"
                style={{ background: `linear-gradient(135deg, ${C.accent}, ${C.purple})` }}
              >
                {salvando ? "Salvando..." : "Trocar senha"}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}

interface CampoProps {
  label: string;
  children: ReactNode;
}

function Campo({ label, children }: CampoProps) {
  return (
    <div className="mb-3">
      <label className="block text-gp-muted text-xs mb-[6px] font-semibold">{label}</label>
      {children}
    </div>
  );
}

import { useState, useEffect, useRef, type CSSProperties, type FormEvent } from "react";
import { C } from "./lib/theme";
import { api } from "./lib/api";

interface Fabricante {
  id: string;
  nome: string;
  [extra: string]: unknown;
}

interface FabricanteModalProps {
  /** Nome inicial (ex.: o que o usuário já tinha digitado na busca). */
  nomeInicial?: string;
  onFechar: () => void;
  onCriado: (fabricante: Fabricante) => void;
}

// Modal enxuto para cadastrar um fabricante/marca sem sair do cadastro de
// produto. Ao salvar, devolve o fabricante criado para o pai já selecioná-lo.
export default function FabricanteModal({ nomeInicial = "", onFechar, onCriado }: FabricanteModalProps) {
  const [nome, setNome] = useState(nomeInicial);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    function aoTecla(e: KeyboardEvent) {
      if (e.key === "Escape" && !salvando) onFechar();
    }
    document.addEventListener("keydown", aoTecla);
    return () => document.removeEventListener("keydown", aoTecla);
  }, [salvando, onFechar]);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    const limpo = nome.trim();
    if (!limpo) { setErro("Informe o nome do fabricante"); return; }
    setSalvando(true);
    setErro("");
    try {
      const fab = await api.criarFabricante({ nome: limpo }) as Fabricante;
      onCriado(fab);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div
      onClick={() => !salvando && onFechar()}
      className="fixed inset-0 flex items-center justify-center p-5"
      style={{ background: "rgba(0,0,0,0.65)", zIndex: 120 }}
    >
      <form
        onSubmit={salvar}
        onClick={(e) => e.stopPropagation()}
        className="bg-gp-card w-full p-6"
        style={{ border: `1px solid ${C.border}`, borderRadius: 14, maxWidth: 440 }}
      >
        <div className="flex justify-between items-center mb-4">
          <div className="text-gp-white font-bold text-lg">Novo fabricante / marca</div>
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar"
            className="bg-transparent border-none text-gp-muted cursor-pointer"
            style={{ fontSize: 20 }}
          >
            ×
          </button>
        </div>

        <p className="text-gp-muted text-[12px] mb-3">
          Cadastre uma vez e reutilize nos próximos produtos — sem reescrever o nome toda hora.
        </p>

        <label className="block text-gp-muted text-xs mb-1.5 font-semibold">Nome *</label>
        <input
          ref={inputRef}
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Ex.: BIC, Faber-Castell, Bosch…"
          style={inputStyle}
          aria-label="Nome do fabricante"
        />

        {erro && (
          <div
            className="mt-3.5 rounded-lg text-[13px] text-gp-red"
            style={{ padding: "10px 12px", background: C.red + "22", border: `1px solid ${C.red}55` }}
          >
            {erro}
          </div>
        )}

        <div className="flex gap-2.5 justify-end mt-5">
          <button
            type="button"
            onClick={onFechar}
            disabled={salvando}
            className="bg-gp-surface text-gp-text rounded-lg font-semibold text-[13px] cursor-pointer"
            style={{ border: `1px solid ${C.border}`, padding: "10px 18px" }}
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={salvando}
            className="text-gp-white border-none rounded-lg font-bold text-[13px]"
            style={{
              background: salvando ? C.muted : `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
              padding: "10px 22px",
              cursor: salvando ? "default" : "pointer",
            }}
          >
            {salvando ? "Salvando..." : "Salvar fabricante"}
          </button>
        </div>
      </form>
    </div>
  );
}

const inputStyle: CSSProperties = {
  width: "100%",
  background: C.surface,
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  padding: "9px 12px",
  color: C.text,
  fontSize: 13,
  outline: "none",
  boxSizing: "border-box",
};

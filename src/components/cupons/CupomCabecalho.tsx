import { urlLogotipo } from "../../Configuracoes";
import { formatarEndereco } from "../../HeaderRelatorio";
import type { ConfiguracaoEmpresa } from "../../Configuracoes";
import type { ConfigImpressora } from "../../lib/impressora";

// Cabecalho padrao do cupom: logo (opcional) + nome + CNPJ + endereco +
// contato + linhas extras do cabecalhoExtra. Aparece em TODOS os templates
// (venda, orcamento, sangria, fechamento, recibo financeiro).
//
// Respeita as flags da ConfiguracaoImpressora:
//   - mostrarLogo, mostrarCnpj
//   - cabecalhoExtra (3 linhas livres)

export type EmpresaCupom = ConfiguracaoEmpresa | null | undefined;
export type CfgCupom = Partial<ConfigImpressora> | null | undefined;

type Props = {
  empresa: EmpresaCupom;
  cfg: CfgCupom;
};

export default function CupomCabecalho({ empresa, cfg }: Props) {
  const logoUrl = cfg?.mostrarLogo !== false ? urlLogotipo(empresa?.logotipo) : null;
  const enderecoCompleto = empresa ? formatarEndereco(empresa) : "";
  const linhasExtras = (cfg?.cabecalhoExtra || "").split("\n").map(s => s.trim()).filter(Boolean);

  return (
    <>
      {logoUrl && (
        <div className="cupom-centro" style={{ marginBottom: 4 }}>
          <img src={logoUrl} alt="" style={{ maxHeight: 50, maxWidth: "70%", objectFit: "contain" }} />
        </div>
      )}
      <div className="cupom-centro cupom-bold">
        {empresa?.nomeFantasia || empresa?.razaoSocial || "GESTÃOPROMAX"}
      </div>
      {empresa?.nomeFantasia && empresa?.razaoSocial && empresa.razaoSocial !== empresa.nomeFantasia && (
        <div className="cupom-centro cupom-mini">{empresa.razaoSocial}</div>
      )}
      {cfg?.mostrarCnpj !== false && empresa?.cnpj && (
        <div className="cupom-centro cupom-mini">CNPJ {empresa.cnpj}</div>
      )}
      {enderecoCompleto && (
        <div className="cupom-centro cupom-mini">{enderecoCompleto}</div>
      )}
      {(empresa?.telefone || empresa?.email) && (
        <div className="cupom-centro cupom-mini">
          {empresa?.telefone}
          {empresa?.telefone && empresa?.email && " · "}
          {empresa?.email}
        </div>
      )}
      {linhasExtras.map((l, i) => (
        <div key={i} className="cupom-centro cupom-mini">{l}</div>
      ))}
    </>
  );
}

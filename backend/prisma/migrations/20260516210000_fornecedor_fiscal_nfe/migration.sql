-- Adiciona campos fiscais ao cadastro de fornecedores
-- (preparacao para emissao futura de NF-e / NFS-e).
-- Todos os campos sao opcionais para nao quebrar registros existentes;
-- a validacao de obrigatoriedade (ex.: IE quando indIEDest=1) e feita
-- no controller (backend/src/controllers/fornecedorController.js).

ALTER TABLE "fornecedores"
  ADD COLUMN "nomeFantasia"     TEXT,
  ADD COLUMN "tipoPessoa"       TEXT,
  ADD COLUMN "numero"           TEXT,
  ADD COLUMN "complemento"      TEXT,
  ADD COLUMN "bairro"           TEXT,
  ADD COLUMN "codMunicipioIBGE" TEXT,
  ADD COLUMN "codUFIBGE"        TEXT,
  ADD COLUMN "codPais"          TEXT    NOT NULL DEFAULT '1058',
  ADD COLUMN "nomePais"         TEXT    NOT NULL DEFAULT 'BRASIL',
  ADD COLUMN "ie"               TEXT,
  ADD COLUMN "ieIsenta"         BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "im"               TEXT,
  ADD COLUMN "indIEDest"        INTEGER,
  ADD COLUMN "crt"              INTEGER,
  ADD COLUMN "emailNFe"         TEXT;

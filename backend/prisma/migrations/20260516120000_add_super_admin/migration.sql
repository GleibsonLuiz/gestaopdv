-- ETAPA 10 multi-tenant: User.superAdmin (desenvolvedor do sistema).
--
-- Flag cross-tenant separada do role normal. Permite acessar a area
-- /admin-master para listar empresas e criar novas. Default false.
--
-- Tambem promovemos automaticamente gleibsonluiz@gmail.com (decisao do
-- proprio usuario via AskUserQuestion). Em ambientes onde esse email
-- nao existe, o UPDATE simplesmente nao afeta nenhuma linha.

-- AlterTable
ALTER TABLE "users" ADD COLUMN "superAdmin" BOOLEAN NOT NULL DEFAULT false;

-- Promove o usuario inicial do sistema. Se o email nao existir, no-op.
UPDATE "users" SET "superAdmin" = true WHERE LOWER(email) = 'gleibsonluiz@gmail.com';

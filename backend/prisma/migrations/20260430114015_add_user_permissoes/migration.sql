-- AlterTable
ALTER TABLE "users" ADD COLUMN     "permissoes" TEXT[] DEFAULT ARRAY[]::TEXT[];

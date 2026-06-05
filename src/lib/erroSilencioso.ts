// Utilitario para substituir `.catch(() => {})` em chamadas de carregamento
// de dados nao-criticos (listas auxiliares, filtros, etc).
//
// Em vez de engolir o erro completamente, loga no console para que falhas
// sejam visiveis durante desenvolvimento/debug sem crashar a UI.
//
// Uso:
//   api.listarCategorias().then(setCategorias).catch(ignorarErro("categorias"));
//   api.obterCaixa().catch(ignorarErro("caixa", () => setCaixa(null)));
//
// O parametro `contexto` identifica qual operacao falhou no log.
// O parametro opcional `fallback` executa logica de recuperacao (ex: setar estado default).

export function ignorarErro(contexto: string, fallback?: () => void) {
  return (err: unknown): void => {
    if (import.meta.env.DEV) {
      console.warn(`[carregamento:${contexto}]`, err);
    }
    fallback?.();
  };
}

// Entry point para o Vercel Functions. O runtime importa este arquivo,
// pega o handler default exportado e chama em cada request. Como o Express
// app implementa a interface (req, res), funciona sem adaptador.
//
// O server.js detecta que NAO esta sendo executado diretamente e nao tenta
// abrir uma porta TCP — o runtime do Vercel gerencia isso.
import app from "../src/server.js";

export default app;

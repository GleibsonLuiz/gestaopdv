// Inicializacao do Sentry (monitoramento de erros do backend).
//
// DEVE ser o PRIMEIRO import do server.js — o SDK precisa instrumentar os
// modulos (http, express) antes deles serem carregados. Por isso este arquivo
// roda o dotenv.config() por conta propria: nesse ponto o server.js ainda nao
// carregou as variaveis de ambiente.
//
// Sem SENTRY_DSN definido (dev local, testes E2E, qualquer ambiente sem a
// variavel) o init e PULADO e tudo segue funcionando normalmente — o Sentry
// e estritamente opt-in por ambiente.
import dotenv from "dotenv";
dotenv.config();

import * as Sentry from "@sentry/node";

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    // Ambiente: usa SENTRY_ENV se setado, senao o VERCEL_ENV (production/
    // preview) que a Vercel injeta sozinha, senao "development".
    environment: process.env.SENTRY_ENV || process.env.VERCEL_ENV || "development",
    // Versao do deploy (Vercel injeta o SHA do commit) — agrupa erros por release.
    release: process.env.VERCEL_GIT_COMMIT_SHA || undefined,
    // Amostragem de performance (transacoes). 0.1 = 10% das requisicoes, o
    // suficiente para tendencias sem estourar a cota do plano gratuito.
    // Erros sao SEMPRE capturados, independente desta taxa.
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
    // PII desligado: o sistema lida com dados de clientes/financeiro. Nao
    // enviamos IP, cookies nem corpo de request por padrao.
    sendDefaultPii: false,
  });
  console.log("[sentry] backend monitorado — environment:", process.env.SENTRY_ENV || process.env.VERCEL_ENV || "development");
}

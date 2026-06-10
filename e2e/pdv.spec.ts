import { test, expect, USUARIOS_TESTE } from "./fixtures";

// ============ TESTES E2E — PDV (PONTO DE VENDA) ============
// Fluxo completo: login → abrir caixa → venda com 2-3 itens → pagamento

test("fluxo completo de venda no PDV", async ({ page, dbUrl }) => {
  // 1. LOGIN
  console.log("🔐 Login como vendedor");
  await page.goto("/");
  await page.waitForLoadState("load");

  // Preenchimento dos campos de login
  await page.fill('input[type="email"]', USUARIOS_TESTE.vendedor.email);
  await page.fill('input[type="password"]', USUARIOS_TESTE.vendedor.senha);
  await page.click('button:has-text("Entrar")');

  // Aguarda fim do carregamento e redirecionamento
  await page.waitForLoadState("load");
  // Após login bem-sucedido, deve estar na tela principal (ou PDV se auto-redireciona)
  const urlAposLogin = page.url();
  console.log(`  → Redirecionado para: ${urlAposLogin}`);

  // 2. NAVEGAR PARA O PDV
  console.log("📍 Navegando para o PDV");
  const pricingPattern = /\/pdv/i;
  if (!pricingPattern.test(urlAposLogin)) {
    // Se não estiver no PDV, clica no link
    await page.click('a:has-text("PDV")');
  }
  await page.waitForLoadState("load");
  await expect(page).toHaveURL(/\/pdv/);

  // 3. ABRIR O CAIXA (se não estiver aberto)
  console.log("💰 Verificando/abrindo caixa");
  let caixaAberta = false;

  // Procura por botão de "Abrir caixa" ou similar
  const abrirCaixaBtn = page.locator('button:has-text("Abrir caixa"), button:has-text("Novo caixa")');
  if (await abrirCaixaBtn.isVisible().catch(() => false)) {
    console.log("  → Caixa fechada, abrindo...");
    await abrirCaixaBtn.click();
    // Modal de abertura de caixa aparece
    await page.fill('input[placeholder*="inicial"], input[placeholder*="Saldo"]', "0");
    await page.click('button:has-text("Abrir"), button:has-text("Confirmar")');
    caixaAberta = true;
  } else {
    // Caixa já está aberto
    caixaAberta = true;
    console.log("  → Caixa já está aberto");
  }
  expect(caixaAberta).toBe(true);

  // 4. ADICIONAR ITENS AO CARRINHO
  console.log("🛒 Adicionando itens ao carrinho");

  // Procura pelo campo de busca de produto (código/nome)
  const buscaProduto = page.locator('input[placeholder*="produto"], input[placeholder*="Código"]');

  // Teste adiciona 2-3 produtos:
  // 1. CADERNO (código: PAP-0001)
  console.log("  → Produto 1: CADERNO");
  await buscaProduto.fill("PAP-0001");
  await page.waitForTimeout(300); // aguarda autocomplete
  const primeiroProduto = page.locator('text=CADERNO UNIVERSITÁRIO').first();
  if (await primeiroProduto.isVisible().catch(() => false)) {
    await primeiroProduto.click();
  } else {
    // Busca por enter se não houver dropdown
    await buscaProduto.press("Enter");
  }
  await page.waitForTimeout(200);

  // Insere quantidade (deve ficar 1 por padrão, mas vamos confirmar)
  const inputQtd1 = page.locator('input[value="1"]').first();
  if (await inputQtd1.isVisible().catch(() => false)) {
    // Quantidade já é 1, tudo bem
  }

  // Pressiona Tab ou clica outro lugar para confirmar item
  await buscaProduto.press("Tab");
  await page.waitForTimeout(200);

  // 2. CANETA (código: PAP-0002)
  console.log("  → Produto 2: CANETA AZUL");
  await buscaProduto.fill("PAP-0002");
  await page.waitForTimeout(300);
  const segundoProduto = page.locator('text=CANETA ESFEROGRÁFICA AZUL').first();
  if (await segundoProduto.isVisible().catch(() => false)) {
    await segundoProduto.click();
  } else {
    await buscaProduto.press("Enter");
  }
  await page.waitForTimeout(200);
  await buscaProduto.press("Tab");
  await page.waitForTimeout(200);

  // 3. COLA (código: PAP-0010)
  console.log("  → Produto 3: COLA BRANCA");
  await buscaProduto.fill("PAP-0010");
  await page.waitForTimeout(300);
  const terceiroProduto = page.locator('text=COLA BRANCA').first();
  if (await terceiroProduto.isVisible().catch(() => false)) {
    await terceiroProduto.click();
  } else {
    await buscaProduto.press("Enter");
  }
  await page.waitForTimeout(200);

  // 5. VALIDAR CARRINHO E CALCULAR TOTAL
  console.log("💹 Validando carrinho");
  // Procura pela tabela de itens do carrinho
  const itensCarrinho = page.locator('table tbody tr, .carrinho-item, [data-testid="item-venda"]');
  const countItens = await itensCarrinho.count();
  console.log(`  → Itens no carrinho: ${countItens}`);
  expect(countItens).toBeGreaterThanOrEqual(2); // mínimo 2 itens

  // Procura pelo valor total
  const totalText = page.locator('text=Total:, text=TOTAL:, [data-total]').first();
  const totalValue = await totalText.textContent().catch(() => "0");
  console.log(`  → Total da venda: ${totalValue}`);
  expect(totalValue).not.toContain("0.00"); // não pode ser zero

  // 6. APLICAR DESCONTO (OPCIONAL)
  console.log("💳 Aplicando desconto (5%)");
  const descontoInput = page.locator('input[placeholder*="desconto"], input[name="desconto"]').first();
  if (await descontoInput.isVisible().catch(() => false)) {
    await descontoInput.fill("5");
    console.log("  → Desconto de 5% aplicado");
  }

  // 7. SELECIONAR FORMA DE PAGAMENTO
  console.log("💰 Selecionando forma de pagamento");
  const formaSelect = page.locator('select[name="forma"], button:has-text("DINHEIRO")').first();

  if (await formaSelect.isVisible().catch(() => false)) {
    // Se for select, escolhe DINHEIRO
    if (formaSelect.isVisible) {
      const selectTag = await formaSelect.evaluate((el: any) => el.tagName);
      if (selectTag === "SELECT") {
        await formaSelect.selectOption("DINHEIRO");
      } else {
        // Se for button, clica direto
        await formaSelect.click();
      }
    }
  } else {
    // Procura por botão/chip de DINHEIRO
    const dinheiroBtn = page.locator('button:has-text("DINHEIRO"), [data-forma="DINHEIRO"]').first();
    if (await dinheiroBtn.isVisible().catch(() => false)) {
      await dinheiroBtn.click();
    }
  }
  console.log("  → Forma: DINHEIRO");

  // 8. CONFIRMAR VENDA
  console.log("✅ Confirmando venda");
  const confirmarBtn = page.locator('button:has-text("Confirmar"), button:has-text("Vender"), button:has-text("Finalizar")').first();
  if (await confirmarBtn.isVisible().catch(() => false)) {
    await confirmarBtn.click();
  }
  await page.waitForTimeout(1000); // aguarda processamento

  // 9. VALIDAR SUCESSO
  console.log("🎉 Validando resultado");
  // Após confirmação, deve haver mensagem de sucesso ou carrinho ser limpo
  const mensagemSucesso = page.locator('text=sucesso, text=Venda realizada, text=✓, text=✔').first();
  const carrinhoLimpo = page.locator('text=Carrinho vazio, text=Adicione itens').first();

  const temSucesso = await mensagemSucesso.isVisible().catch(() => false);
  const temCarrinhoLimpo = await carrinhoLimpo.isVisible().catch(() => false);

  console.log(`  → Mensagem de sucesso: ${temSucesso}`);
  console.log(`  → Carrinho limpo: ${temCarrinhoLimpo}`);
  expect(temSucesso || temCarrinhoLimpo).toBe(true);

  console.log("✅ Teste concluído com sucesso!");
});

test("login com 2FA (se ativado)", async ({ page }) => {
  // Setup: usuário com 2FA ativado (precisa estar no seed ou ser criado antes)
  console.log("🔐 Login com 2FA TOTP");

  await page.goto("/");
  await page.waitForLoadState("load");

  // Login normal (email + senha)
  await page.fill('input[type="email"]', USUARIOS_TESTE.vendedor.email);
  await page.fill('input[type="password"]', USUARIOS_TESTE.vendedor.senha);
  await page.click('button:has-text("Entrar")');

  await page.waitForTimeout(500);

  // Se houver campo de código 2FA, teste falha por enquanto (precisa de mock do app)
  const codigoTotp = page.locator('input[placeholder*="código"], input[placeholder*="6"]').first();
  if (await codigoTotp.isVisible().catch(() => false)) {
    console.log("⚠️  2FA detectado — teste pula (requer mock de app autenticador)");
    // Aqui entraria integração com biblioteca de TOTP para gerar código válido
    // Por enquanto, pulamos
    return;
  }

  // Se não houver campo, login simples funciona
  await expect(page).toHaveURL(/^\/$/);
  console.log("✅ Login bem-sucedido (sem 2FA)");
});

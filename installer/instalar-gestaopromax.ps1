# =====================================================================
#  GestaoProMax - Instalador de Impressao Direta (PC do lojista)
# ---------------------------------------------------------------------
#  Num clique, deixa a impressao termica pronta neste computador:
#    1. Instala o QZ Tray (agente de impressao), se ainda nao tiver.
#    2. Registra o certificado do GestaoProMax como CONFIAVEL no QZ
#       (impressao silenciosa, sem o aviso "permitir" a cada cupom).
#    3. Cria o atalho "PDV (impressao direta)" na Area de Trabalho.
#
#  Como usar: clique com o botao direito neste arquivo ->
#  "Executar com o PowerShell". Ele pede permissao de administrador.
#
#  Requisitos: Windows 10/11 + Google Chrome. A impressora termica deve
#  estar instalada no Windows antes de rodar.
# =====================================================================

param(
  [string]$AppUrl = "https://gestaopdv.vercel.app",
  [string]$QzVersion = "2.2.6"
)

$ErrorActionPreference = "Stop"

# --- Auto-elevacao: relança como administrador se necessario ----------
$ehAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()
          ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $ehAdmin) {
  Write-Host "Solicitando permissao de administrador..." -ForegroundColor Yellow
  Start-Process powershell -Verb RunAs -ArgumentList @(
    "-NoProfile", "-ExecutionPolicy", "Bypass",
    "-File", "`"$PSCommandPath`"",
    "-AppUrl", "`"$AppUrl`"", "-QzVersion", "`"$QzVersion`""
  )
  exit
}

function Passo($n, $t) { Write-Host "`n[$n] $t" -ForegroundColor Cyan }
function Ok($t)        { Write-Host "    OK - $t" -ForegroundColor Green }
function Aviso($t)     { Write-Host "    ! $t" -ForegroundColor Yellow }

$raiz     = $PSScriptRoot
$certSrc  = Join-Path $raiz "GestaoProMax.crt"
$icoSrc   = Join-Path $raiz "pdv.ico"
$qzDir    = "C:\Program Files\QZ Tray"
$qzExe    = Join-Path $qzDir "qz-tray.exe"
$qzProps  = Join-Path $qzDir "qz-tray.properties"
$certDest = Join-Path $qzDir "GestaoProMax.crt"

Write-Host "===========================================================" -ForegroundColor Magenta
Write-Host "   GestaoProMax - Instalador de Impressao Direta" -ForegroundColor Magenta
Write-Host "===========================================================" -ForegroundColor Magenta

# --- 1. Instalar QZ Tray ---------------------------------------------
Passo 1 "Verificando o agente de impressao (QZ Tray)..."
if (Test-Path $qzExe) {
  Ok "QZ Tray ja instalado."
} else {
  Write-Host "    Baixando QZ Tray v$QzVersion (~100 MB)..." -ForegroundColor Gray
  $url = "https://github.com/qzind/tray/releases/download/v$QzVersion/qz-tray-$QzVersion-x86_64.exe"
  $tmp = Join-Path $env:TEMP "qz-tray-$QzVersion.exe"
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  $ProgressPreference = "SilentlyContinue"
  Invoke-WebRequest -Uri $url -OutFile $tmp -UseBasicParsing
  Write-Host "    Instalando (silencioso)..." -ForegroundColor Gray
  Start-Process $tmp -ArgumentList "/S" -Wait
  Start-Sleep -Seconds 3
  if (Test-Path $qzExe) { Ok "QZ Tray instalado." }
  else { throw "Falha ao instalar o QZ Tray. Verifique espaco em disco e tente de novo." }
}

# --- 2. Registrar o certificado como confiavel -----------------------
Passo 2 "Registrando o certificado do GestaoProMax (impressao silenciosa)..."
if (-not (Test-Path $certSrc)) { throw "Arquivo GestaoProMax.crt nao encontrado ao lado do instalador." }
Copy-Item $certSrc $certDest -Force
Ok "Certificado copiado."

$linhaTrust = "authcert.override=C:/Program Files/QZ Tray/GestaoProMax.crt"
$props = if (Test-Path $qzProps) { Get-Content $qzProps -Raw } else { "" }
if ($props -notmatch "authcert\.override") {
  Add-Content $qzProps "`r`n$linhaTrust"
  Ok "Certificado marcado como confiavel no QZ."
} else {
  Ok "Confianca ja estava configurada."
}

# Reinicia o QZ para aplicar a confianca
Get-Process -ErrorAction SilentlyContinue | Where-Object {
  ($_.Path -and $_.Path.StartsWith($qzDir)) -or $_.Name -match "qz-tray"
} | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
Start-Process $qzExe -ErrorAction SilentlyContinue
Ok "Agente reiniciado e em execucao."

# --- 3. Atalho do PDV na Area de Trabalho ----------------------------
Passo 3 "Criando o atalho 'PDV (impressao direta)'..."
$chrome = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LocalAppData\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if ($chrome) {
  $desktop = [Environment]::GetFolderPath("Desktop")
  $lnk = Join-Path $desktop "PDV (impressao direta).lnk"
  $userData = "$env:LocalAppData\ChromePDV"
  # --lang/--accept-lang=pt-BR: o perfil dedicado (ChromePDV) nasce zerado e
  # cairia no padrao en-US, fazendo o seletor de data nativo (<input type=date>)
  # exibir MM/DD/AAAA. Forcamos portugues para mostrar DD/MM/AAAA como no Brasil.
  $args = "--user-data-dir=`"$userData`" --lang=pt-BR --accept-lang=pt-BR,pt --app=`"$AppUrl`""
  $ws = New-Object -ComObject WScript.Shell
  $sc = $ws.CreateShortcut($lnk)
  $sc.TargetPath = $chrome
  $sc.Arguments = $args
  $sc.WorkingDirectory = Split-Path $chrome
  if (Test-Path $icoSrc) {
    $icoDest = "$env:LocalAppData\GestaoPDV\pdv.ico"
    New-Item -ItemType Directory -Force (Split-Path $icoDest) | Out-Null
    Copy-Item $icoSrc $icoDest -Force
    $sc.IconLocation = "$icoDest,0"
  }
  $sc.Description = "Abre o PDV GestaoProMax em modo aplicativo"
  $sc.Save()
  Ok "Atalho criado na Area de Trabalho."
} else {
  Aviso "Google Chrome nao encontrado - atalho nao criado. Instale o Chrome e rode de novo (a impressao ja funciona pelo navegador)."
}

# --- Fim --------------------------------------------------------------
Write-Host "`n===========================================================" -ForegroundColor Green
Write-Host "   Instalacao concluida!" -ForegroundColor Green
Write-Host "===========================================================" -ForegroundColor Green
Write-Host @"

Proximos passos no sistema:
  1. Abra o atalho 'PDV (impressao direta)' e faca login.
  2. Configuracoes -> Impressora -> card do agente (QZ Tray):
       - Detectar agente / listar impressoras
       - Escolher a sua impressora termica
       - Ligar 'Usar o agente para imprimir o cupom da venda'
  3. Imprima um cupom de teste. Deve sair direto na bobina, sem avisos.

Dica: deixe o QZ Tray iniciar com o Windows (icone na bandeja -> Start automatically).

"@ -ForegroundColor White

Read-Host "Pressione ENTER para fechar"

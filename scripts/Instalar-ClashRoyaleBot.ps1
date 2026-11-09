#Requires -Version 5.1
[CmdletBinding()]
param(
    [string]$InstallDir = (Join-Path $env:USERPROFILE 'ClashRoyaleBot'),
    [ValidateRange(1024, 65535)][int]$WebPort = 3000,
    [switch]$NoBrowser
)
$ErrorActionPreference = 'Stop'
$repository = 'DargeoUY/bot-clash-royale'
$sourceRef = 'feat/multiclan-web-docker'
$previousLocation = Get-Location
$temporaryDir = $null

function New-RandomSecret {
    $bytes = New-Object byte[] 32
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    return ([System.BitConverter]::ToString($bytes)).Replace('-', '').ToLowerInvariant()
}
function Invoke-Docker {
    param([string[]]$DockerArgs)
    & docker @DockerArgs
    if ($LASTEXITCODE -ne 0) { throw "Docker fallo al ejecutar: docker $($DockerArgs -join ' ')" }
}
try {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        throw 'Instala Docker Desktop, habilita WSL 2 y abre Docker Desktop antes de ejecutar este script.'
    }
    $dockerType = & docker info --format '{{.OSType}}' 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'Docker no responde. Abri Docker Desktop y espera a que el motor este listo.' }
    if ($dockerType -ne 'linux') { throw 'Docker debe estar en modo Linux containers. Cambia el modo desde Docker Desktop.' }
    Invoke-Docker -DockerArgs @('compose', 'version')
    $InstallDir = [System.IO.Path]::GetFullPath($InstallDir)
    if (-not (Test-Path $InstallDir)) { New-Item -ItemType Directory -Path $InstallDir | Out-Null }
    $composePath = Join-Path $InstallDir 'docker-compose.yml'
    if (-not (Test-Path $composePath)) {
        if (@(Get-ChildItem -LiteralPath $InstallDir -Force).Count -gt 0) {
            throw 'La carpeta destino contiene archivos. Usa -InstallDir con una carpeta nueva y vacia.'
        }
        Write-Host 'Descargando ClashRoyaleBot...' -ForegroundColor Cyan
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        $temporaryDir = Join-Path ([System.IO.Path]::GetTempPath()) ('clash-install-' + [guid]::NewGuid().ToString('N'))
        New-Item -ItemType Directory -Path $temporaryDir | Out-Null
        $archive = Join-Path $temporaryDir 'source.zip'
        Invoke-WebRequest -Uri "https://api.github.com/repos/$repository/zipball/$sourceRef" -Headers @{ 'User-Agent' = 'ClashRoyaleBot-Installer' } -OutFile $archive -UseBasicParsing
        $extract = Join-Path $temporaryDir 'source'
        Expand-Archive -LiteralPath $archive -DestinationPath $extract
        $root = @(Get-ChildItem -LiteralPath $extract -Directory)
        if ($root.Count -ne 1) { throw 'El archivo descargado no tiene la estructura esperada.' }
        Get-ChildItem -LiteralPath $root[0].FullName -Force | ForEach-Object {
            Move-Item -LiteralPath $_.FullName -Destination $InstallDir
        }
    }
    $packagePath = Join-Path $InstallDir 'package.json'
    if (-not (Test-Path $packagePath)) { throw 'La carpeta no contiene una instalacion valida de ClashRoyaleBot.' }
    $package = Get-Content -LiteralPath $packagePath -Raw | ConvertFrom-Json
    if ($package.name -ne 'bot-clash-royale' -or [version]$package.version -lt [version]'0.2.0') {
        throw 'Esta carpeta tiene otra version/proyecto. No se modificaron sus datos. Elegi una carpeta nueva con -InstallDir.'
    }
    Set-Location -LiteralPath $InstallDir
    $envPath = Join-Path $InstallDir '.env'
    $createdEnv = $false
    if (-not (Test-Path $envPath)) {
        Write-Host 'Ingresa la API key de Clash Royale. No se mostrara en pantalla.' -ForegroundColor Cyan
        $secureKey = Read-Host 'CR_API_KEY' -AsSecureString
        $apiKey = [System.Net.NetworkCredential]::new('', $secureKey).Password
        if ([string]::IsNullOrWhiteSpace($apiKey) -or $apiKey -notmatch '^[A-Za-z0-9_.-]+$') {
            throw 'La API key esta vacia o tiene un formato inesperado.'
        }
        $dbPassword = New-RandomSecret
        $rootPassword = New-RandomSecret
        $sessionSecret = New-RandomSecret
        $signupToken = New-RandomSecret
        $content = @"
DB_USER=clashbot
DB_PASSWORD=$dbPassword
DB_ROOT_PASSWORD=$rootPassword
DATABASE_URL=mysql://clashbot:${dbPassword}@db:3306/clashbot
SESSION_SECRET=$sessionSecret
SIGNUP_TOKEN=$signupToken
BASE_URL=http://localhost:$WebPort
COOKIE_SECURE=false
TRUST_PROXY=0
BIND_ADDRESS=127.0.0.1
WEB_PORT=$WebPort
HEALTHCHECK_PORT=3000
CR_API_KEY=$apiKey
CR_API_BASE_URL=https://api.clashroyale.com/v1
DISCORD_TOKEN=
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
TELEGRAM_TOKEN=
CLAN_TAG="#28P8RQUY"
INACTIVITY_THRESHOLD_DAYS=2
VACATION_MAX_DAYS=20
LOG_LEVEL=info
TZ=America/Montevideo
"@
        [System.IO.File]::WriteAllText($envPath, $content, [System.Text.UTF8Encoding]::new($false))
        $apiKey = $null; $secureKey = $null; $content = $null
        # Restrict this configuration file to the current Windows user and system administrators.
        $currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
        & icacls $envPath '/inheritance:r' '/grant:r' "*${currentUser}:(F)" '*S-1-5-18:(F)' '*S-1-5-32-544:(F)' | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'No se pudieron restringir los permisos del archivo .env. Revisa sus permisos antes de continuar.' }
        $createdEnv = $true
    } else {
        Write-Host 'Se conserva el archivo .env existente y sus credenciales.' -ForegroundColor Yellow
    }
    Write-Host 'Validando y construyendo los contenedores. La primera vez puede demorar varios minutos...' -ForegroundColor Cyan
    Invoke-Docker -DockerArgs @('compose', 'config', '--quiet')
    Invoke-Docker -DockerArgs @('compose', 'up', '-d', '--build', '--wait', '--wait-timeout', '300')
    Invoke-Docker -DockerArgs @('compose', 'ps')
    $portLine = Get-Content -LiteralPath $envPath | Where-Object { $_ -match '^WEB_PORT=' } | Select-Object -Last 1
    $actualPort = if ($portLine) { [int]($portLine -replace '^WEB_PORT=', '') } else { $WebPort }
    $url = "http://localhost:$actualPort"
    $ready = Invoke-RestMethod -Uri "$url/ready" -TimeoutSec 15
    if ($ready.status -ne 'ready') { throw 'La aplicacion no confirma conexion con la base de datos.' }
    Write-Host "`nInstalacion lista: $url" -ForegroundColor Green
    Write-Host "Carpeta: $InstallDir"
    Write-Host 'Crea tu cuenta web con el tag de tu clan y el valor SIGNUP_TOKEN del archivo .env.'
    Write-Host 'Para consultar solo ese codigo: (Get-Content .env | Select-String ''^SIGNUP_TOKEN='').Line'
    Write-Host 'Luego ejecuta /sync desde Consultas y acciones.'
    Write-Host 'Discord, Telegram y el QR de WhatsApp se configuran despues desde la guia del proyecto.'
    Write-Host 'La API key debe autorizar la IP publica de salida de este equipo.'
    Write-Host 'No compartas .env. No ejecutes docker compose down -v: borraria los datos.'
    if (-not $NoBrowser) { Start-Process $url }
} catch {
    Write-Host "`nNo se completo la instalacion: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host 'Si los contenedores llegaron a crearse, consulta sus registros con docker compose logs --tail 100 bot db desde la carpeta de instalacion.'
    throw
} finally {
    Set-Location $previousLocation
    if ($temporaryDir -and (Test-Path $temporaryDir)) { Remove-Item -LiteralPath $temporaryDir -Recurse -Force }
}

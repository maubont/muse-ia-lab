# Orquestador: genera videos del avatar para una lista de nombres en tandas
# paralelas (maximo 4 a la vez) con 1 reintento para los que fallen.
# Uso: pwsh scripts/generar-tanda-videos.ps1 -Nombres GENERICO_2,GENERICO_3,Carlos
param(
    [Parameter(Mandatory = $true)][string[]]$Nombres,
    [int]$Paralelo = 4
)

$ErrorActionPreference = "Continue"
$raiz = Split-Path -Parent $PSScriptRoot
$script = Join-Path $raiz "scripts\generar-video-avatar.mjs"
$logsDir = Join-Path $raiz "avatar\logs"
New-Item -ItemType Directory -Force $logsDir | Out-Null

function Get-Secreto([string]$clave) {
    $salida = ((npx @insforge/cli secrets get $clave | Out-String).Trim()) -replace "`e\[[0-9;]*m", ""
    return ($salida -split '\s+')[-1]
}

$env:FAL_KEY = Get-Secreto "FAL_KEY"
$env:OPENAI_API_KEY = Get-Secreto "OPENAI_API_KEY"
if (-not $env:FAL_KEY -or -not $env:OPENAI_API_KEY) { Write-Error "No pude leer los secretos"; exit 1 }

function Get-Slug([string]$nombre) {
    if ($nombre -match '^GENERICO[_-]?(\d+)$') { return "generico-$($Matches[1])" }
    $n = $nombre.Normalize([Text.NormalizationForm]::FormD) -replace '\p{Mn}', ''
    return ($n.ToLowerInvariant() -replace '[^a-z0-9]+', '-').Trim('-')
}

function Invoke-Tanda([string[]]$lista) {
    $lista | ForEach-Object -Parallel {
        $nombre = $_
        if ($nombre -match '^GENERICO[_-]?(\d+)$') {
            $slug = "generico-$($Matches[1])"
        } else {
            $n = $nombre.Normalize([Text.NormalizationForm]::FormD) -replace '\p{Mn}', ''
            $slug = ($n.ToLowerInvariant() -replace '[^a-z0-9]+', '-').Trim('-')
        }
        $log = Join-Path $using:logsDir "$slug.log"
        node $using:script --nombre $nombre *>> $log
        [pscustomobject]@{ Nombre = $nombre; Slug = $slug; Exit = $LASTEXITCODE }
    } -ThrottleLimit $Paralelo
}

Write-Host "=== Tanda inicial: $($Nombres.Count) nombres (paralelo=$Paralelo) ==="
$resultados = Invoke-Tanda $Nombres
$fallidos = @($resultados | Where-Object { $_.Exit -ne 0 } | ForEach-Object { $_.Nombre })

foreach ($r in $resultados) { Write-Host ("{0} -> exit {1}" -f $r.Nombre, $r.Exit) }

if ($fallidos.Count -gt 0) {
    Write-Host "=== Reintento (1 vez) de: $($fallidos -join ', ') ==="
    $resultados2 = Invoke-Tanda $fallidos
    foreach ($r in $resultados2) { Write-Host ("REINTENTO {0} -> exit {1}" -f $r.Nombre, $r.Exit) }
    $definitivos = @($resultados2 | Where-Object { $_.Exit -ne 0 } | ForEach-Object { $_.Nombre })
    if ($definitivos.Count -gt 0) {
        Write-Host "FALLIDOS_DEFINITIVOS: $($definitivos -join ', ')"
        exit 2
    }
}
Write-Host "TODOS_OK"
exit 0

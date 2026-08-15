param(
  [Parameter(Mandatory = $true)]
  [string]$SampleList,

  [Parameter(Mandatory = $true)]
  [string]$ReadyPrefix,

  [Parameter(Mandatory = $true)]
  [string]$AcknowledgmentPrefix
)

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$runner = Join-Path $PSScriptRoot 'run-powershell-docs-sample.ps1'
Set-Location $root

foreach ($sample in $SampleList -split ',') {
  Clear-Host
  & $runner -Sample $sample
  $readyPath = "$ReadyPrefix.$sample"
  $acknowledgmentPath = "$AcknowledgmentPrefix.$sample"
  Set-Content -LiteralPath $readyPath -Value $PID -NoNewline

  for ($attempt = 0; $attempt -lt 150 -and -not (Test-Path -LiteralPath $acknowledgmentPath); $attempt += 1) {
    Start-Sleep -Milliseconds 100
  }
  if (-not (Test-Path -LiteralPath $acknowledgmentPath)) {
    throw "Documentation sample '$sample' was not acknowledged after capture."
  }

  Remove-Item -LiteralPath $readyPath -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $acknowledgmentPath -ErrorAction SilentlyContinue
}

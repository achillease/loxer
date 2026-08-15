param(
  [Parameter(Mandatory = $true)]
  [string]$Sample
)

Set-Location (Resolve-Path (Join-Path $PSScriptRoot '..'))
node (Join-Path $PSScriptRoot 'print-powershell-docs-sample.mjs') $Sample

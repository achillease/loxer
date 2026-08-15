param(
  [string]$OnlySamples
)

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$runner = Join-Path $PSScriptRoot 'run-powershell-docs-sequence.ps1'
$capture = Join-Path $PSScriptRoot 'capture-powershell-window.ps1'
$outputDirectory = Join-Path $root 'assets/docs_images'

$samples = @(
  @{ Name = 'load-order'; Lines = 4 },
  @{ Name = 'submit-order'; Lines = 3 },
  @{ Name = 'nested-order'; Lines = 11 },
  @{ Name = 'manual-box'; Lines = 5 },
  @{ Name = 'props'; Lines = 6 },
  @{ Name = 'standalone-logs'; Lines = 4 },
  @{ Name = 'trace-points'; Lines = 11 },
  @{ Name = 'overlapping-boxes'; Lines = 22 }
)

if ($OnlySamples) {
  $requestedSamples = $OnlySamples -split ','
  $samples = @($samples | Where-Object Name -In $requestedSamples)
  if ($samples.Count -ne $requestedSamples.Count) {
    throw "Unknown documentation sample in '$OnlySamples'."
  }
}

New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null

function Find-DocumentationTerminal([int]$ChildProcessId) {
  $currentProcessId = $ChildProcessId
  while ($true) {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $currentProcessId" -ErrorAction SilentlyContinue
    if ($null -eq $process) {
      return $null
    }
    if ($process.Name -eq 'WindowsTerminal.exe') {
      return Get-Process -Id $process.ProcessId -ErrorAction SilentlyContinue
    }
    if ($process.ParentProcessId -eq 0 -or $process.ParentProcessId -eq $currentProcessId) {
      return $null
    }
    $currentProcessId = [int]$process.ParentProcessId
  }
}

$sampleList = $samples.Name -join ','
$readyPrefix = Join-Path ([System.IO.Path]::GetTempPath()) "loxer-docs-images-$PID"
$acknowledgmentPrefix = Join-Path ([System.IO.Path]::GetTempPath()) "loxer-docs-images-ack-$PID"
$terminalArguments = @(
  '-w', 'new',
  'new-tab',
  'powershell.exe',
  '-NoLogo',
  '-NoProfile',
  '-File', $runner,
  '-SampleList', $sampleList,
  '-ReadyPrefix', $readyPrefix
  '-AcknowledgmentPrefix', $acknowledgmentPrefix
)
Start-Process -FilePath wt.exe -ArgumentList $terminalArguments -WindowStyle Normal | Out-Null

$terminal = $null

foreach ($sample in $samples) {
  $readyPath = "$readyPrefix.$($sample.Name)"
  $acknowledgmentPath = "$acknowledgmentPrefix.$($sample.Name)"
  for ($attempt = 0; $attempt -lt 150 -and -not (Test-Path -LiteralPath $readyPath); $attempt += 1) {
    Start-Sleep -Milliseconds 100
  }
  if (-not (Test-Path -LiteralPath $readyPath)) {
    throw "Documentation sample '$($sample.Name)' did not report ready."
  }
  if ($null -eq $terminal) {
    $runnerProcessId = [int](Get-Content -LiteralPath $readyPath -Raw)
    $terminal = Find-DocumentationTerminal $runnerProcessId
    if ($null -eq $terminal) {
      throw "Could not find the Windows Terminal that started documentation sample '$($sample.Name)'."
    }
  }

  $candidatePath = Join-Path $outputDirectory ".$($sample.Name)-default.candidate.png"
  try {
    & $capture -ProcessId $terminal.Id `
      -OutputPath $candidatePath `
      -CaptureHeight ($sample.Lines * 19)
    Move-Item -Force -LiteralPath $candidatePath -Destination (Join-Path $outputDirectory "$($sample.Name)-default.png")
    Set-Content -LiteralPath $acknowledgmentPath -Value $PID -NoNewline
  } finally {
    Remove-Item -LiteralPath $readyPath -ErrorAction SilentlyContinue
  }
}

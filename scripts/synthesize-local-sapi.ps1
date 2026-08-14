param(
  [Parameter(Mandatory = $true)]
  [string]$OutputPath,

  [Parameter(Mandatory = $true)]
  [ValidateSet("Microsoft Ravi", "Microsoft Heera", "Microsoft David", "Microsoft Zira")]
  [string]$Voice
)

$ErrorActionPreference = "Stop"
$text = [Console]::In.ReadToEnd()
if ([string]::IsNullOrWhiteSpace($text) -or $text.Length -gt 1600) {
  throw "Speech text must contain 1 to 1600 characters."
}

$tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$resolvedOutput = [IO.Path]::GetFullPath($OutputPath)
if (-not $resolvedOutput.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase)) {
  throw "Speech output path must remain inside the OS temporary directory."
}

Add-Type -AssemblyName System.Speech
$synth = [System.Speech.Synthesis.SpeechSynthesizer]::new()
try {
  $synth.SelectVoice($Voice)
  $synth.Rate = 0
  $synth.Volume = 100
  $synth.SetOutputToWaveFile($resolvedOutput)
  $synth.Speak($text)
  $synth.SetOutputToNull()
}
finally {
  $synth.Dispose()
}

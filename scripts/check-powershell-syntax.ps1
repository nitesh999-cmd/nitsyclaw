$ErrorActionPreference = "Stop"

Write-Host "== PowerShell syntax check =="

$files = @(git ls-files "*.ps1")
if ($LASTEXITCODE -ne 0) {
    throw "git ls-files failed."
}

if ($files.Count -eq 0) {
    Write-Host "No tracked PowerShell scripts found."
    exit 0
}

$failed = $false
foreach ($file in $files) {
    $tokens = $null
    $errors = $null
    [System.Management.Automation.Language.Parser]::ParseFile($file, [ref]$tokens, [ref]$errors) > $null
    if ($errors.Count -gt 0) {
        $failed = $true
        Write-Error "PowerShell parse failed: $file"
        $errors | Format-List | Out-String | Write-Error
    }
}

if ($failed) {
    exit 1
}

Write-Host "PowerShell syntax check passed for $($files.Count) tracked script(s)."

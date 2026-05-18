param(
    [string]$BaseUrl = "https://nitsyclaw.vercel.app",
    [string]$ExpectedLoginText = "Personal life admin",
    [string]$ForbiddenLoginText = "Personal AI control plane",
    [string]$DashboardUser = $env:NITSYCLAW_DASHBOARD_USER,
    [string]$DashboardPassword = $env:NITSYCLAW_DASHBOARD_PASSWORD
)

$ErrorActionPreference = "Stop"

function Normalize-BaseUrl {
    param([Parameter(Mandatory = $true)][string]$Url)
    $trimmed = $Url.Trim().TrimEnd("/")
    if ($trimmed -notmatch '^https://[a-z0-9.-]+$') {
        throw "BaseUrl must be a concrete https:// hostname."
    }
    return $trimmed
}

function Invoke-SmokeHead {
    param(
        [Parameter(Mandatory = $true)][string]$Url,
        [Parameter(Mandatory = $true)][int]$ExpectedStatus,
        [bool]$RequireNoStore = $true
    )

    $response = & curl.exe -sS -I $Url
    if ($LASTEXITCODE -ne 0) {
        throw "curl HEAD failed for $Url."
    }
    $text = $response -join "`n"
    $statusLine = @($response | Where-Object { $_ -match '^HTTP/' } | Select-Object -Last 1)[0]
    if ($statusLine -notmatch "HTTP/.* $ExpectedStatus") {
        throw "$Url expected HTTP $ExpectedStatus, got $statusLine."
    }
    if ($RequireNoStore -and $text -notmatch "(?im)^Cache-Control:.*no-store") {
        throw "$Url missing Cache-Control: no-store."
    }
    Write-Host "OK $ExpectedStatus HEAD $Url"
}

function Invoke-SmokeGet {
    param(
        [Parameter(Mandatory = $true)][string]$Url,
        [Parameter(Mandatory = $true)][int]$ExpectedStatus,
        [bool]$RequireNoStore = $true
    )

    $response = & curl.exe -sS -i $Url
    if ($LASTEXITCODE -ne 0) {
        throw "curl GET failed for $Url."
    }
    $text = $response -join "`n"
    $statusLine = @($response | Where-Object { $_ -match '^HTTP/' } | Select-Object -Last 1)[0]
    if ($statusLine -notmatch "HTTP/.* $ExpectedStatus") {
        throw "$Url expected HTTP $ExpectedStatus, got $statusLine."
    }
    if ($RequireNoStore -and $text -notmatch "(?im)^Cache-Control:.*no-store") {
        throw "$Url missing Cache-Control: no-store."
    }
    Write-Host "OK $ExpectedStatus GET $Url"
    return $text
}

function Invoke-SmokeLogin {
    param([Parameter(Mandatory = $true)][string]$Root)

    $cookieFile = [System.IO.Path]::GetTempFileName()
    $user = if ($DashboardUser) { $DashboardUser } else { "nitesh" }
    $response = & curl.exe -sS -i -c $cookieFile -H "Origin: $Root" --data-urlencode "user=$user" --data-urlencode "password=$DashboardPassword" --data-urlencode "next=/confirmations" "$Root/api/auth/login"
    if ($LASTEXITCODE -ne 0) {
        Remove-Item -LiteralPath $cookieFile -ErrorAction SilentlyContinue
        throw "curl login failed for $Root/api/auth/login."
    }
    $statusLine = @($response | Where-Object { $_ -match '^HTTP/' } | Select-Object -Last 1)[0]
    if ($statusLine -notmatch "HTTP/.* 303") {
        Remove-Item -LiteralPath $cookieFile -ErrorAction SilentlyContinue
        throw "/api/auth/login expected HTTP 303, got $statusLine."
    }
    $text = $response -join "`n"
    if ($text -notmatch "(?im)^Set-Cookie:") {
        Remove-Item -LiteralPath $cookieFile -ErrorAction SilentlyContinue
        throw "/api/auth/login did not set a session cookie."
    }
    Write-Host "OK 303 POST $Root/api/auth/login"
    return $cookieFile
}

function Invoke-AuthenticatedSmokeGet {
    param(
        [Parameter(Mandatory = $true)][string]$Url,
        [Parameter(Mandatory = $true)][string]$CookieFile,
        [Parameter(Mandatory = $true)][string]$ExpectedText
    )

    $response = & curl.exe -sS -i -b $CookieFile $Url
    if ($LASTEXITCODE -ne 0) {
        throw "curl authenticated GET failed for $Url."
    }
    $text = $response -join "`n"
    $statusLine = @($response | Where-Object { $_ -match '^HTTP/' } | Select-Object -Last 1)[0]
    if ($statusLine -notmatch "HTTP/.* 200") {
        throw "$Url expected authenticated HTTP 200, got $statusLine."
    }
    if ($text -notmatch "(?im)^Cache-Control:.*no-store") {
        throw "$Url missing Cache-Control: no-store."
    }
    if ($text -notmatch [regex]::Escape($ExpectedText)) {
        throw "$Url missing expected authenticated content: $ExpectedText"
    }
    Write-Host "OK 200 AUTH GET $Url"
}

$root = Normalize-BaseUrl -Url $BaseUrl
Write-Host "== NitsyClaw live smoke =="
Write-Host "Target: $root"

$health = Invoke-SmokeGet -Url "$root/api/healthz" -ExpectedStatus 200
if ($health -notmatch '"ok"\s*:\s*true') {
    throw "/api/healthz did not return ok=true."
}

Invoke-SmokeHead -Url "$root/privacy" -ExpectedStatus 200
Invoke-SmokeHead -Url "$root/terms" -ExpectedStatus 200
[void](Invoke-SmokeGet -Url "$root/api/sale-readiness" -ExpectedStatus 401)
[void](Invoke-SmokeGet -Url "$root/api/chat/history" -ExpectedStatus 401)
$commandRedirect = Invoke-SmokeGet -Url "$root/command" -ExpectedStatus 307
if ($commandRedirect -notmatch "(?im)^Location:\s*/login\?next=%2Fcommand\s*$") {
    throw "/command did not redirect unauthenticated users to /login?next=%2Fcommand."
}
$healthRedirect = Invoke-SmokeGet -Url "$root/health" -ExpectedStatus 307
if ($healthRedirect -notmatch "(?im)^Location:\s*/login\?next=%2Fhealth\s*$") {
    throw "/health did not redirect unauthenticated users to /login?next=%2Fhealth."
}
$whatsappRecoveryRedirect = Invoke-SmokeGet -Url "$root/whatsapp-recovery" -ExpectedStatus 307
if ($whatsappRecoveryRedirect -notmatch "(?im)^Location:\s*/login\?next=%2Fwhatsapp-recovery\s*$") {
    throw "/whatsapp-recovery did not redirect unauthenticated users to /login?next=%2Fwhatsapp-recovery."
}
$privacyCenterRedirect = Invoke-SmokeGet -Url "$root/privacy-center" -ExpectedStatus 307
if ($privacyCenterRedirect -notmatch "(?im)^Location:\s*/login\?next=%2Fprivacy-center\s*$") {
    throw "/privacy-center did not redirect unauthenticated users to /login?next=%2Fprivacy-center."
}

$login = Invoke-SmokeGet -Url "$root/login" -ExpectedStatus 200
if ($login -notmatch [regex]::Escape($ExpectedLoginText)) {
    throw "/login missing expected copy: $ExpectedLoginText"
}
if ($login -match [regex]::Escape($ForbiddenLoginText)) {
    throw "/login still contains forbidden copy: $ForbiddenLoginText"
}

if ($DashboardPassword) {
    $cookieFile = Invoke-SmokeLogin -Root $root
    try {
        Invoke-AuthenticatedSmokeGet -Url "$root/confirmations" -CookieFile $cookieFile -ExpectedText "Confirmations"
        Invoke-AuthenticatedSmokeGet -Url "$root/privacy-center" -CookieFile $cookieFile -ExpectedText "Your data, controls, and trust checks"
    } finally {
        Remove-Item -LiteralPath $cookieFile -ErrorAction SilentlyContinue
    }
} else {
    Write-Host "SKIP authenticated dashboard smoke: NITSYCLAW_DASHBOARD_PASSWORD is not available."
}

Write-Host "Live smoke passed."

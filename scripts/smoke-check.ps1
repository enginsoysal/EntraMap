param(
    [string]$BaseUrl = "http://127.0.0.1:5000",
    [string]$PythonExe = "",
    [switch]$NoStart
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if (-not $PythonExe) {
    $PythonExe = Join-Path $repoRoot ".venv/Scripts/python.exe"
}

$proc = $null
$startedHere = $false

function Get-OkResponse {
    param(
        [string]$Url,
        [string]$Name
    )

    try {
        $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
        if ($response.StatusCode -ne 200) {
            throw "$Name returned HTTP $($response.StatusCode)"
        }
        Write-Host "[OK] $Name -> HTTP 200"
        return $response
    }
    catch {
        throw "[FAIL] $Name -> $($_.Exception.Message)"
    }
}

try {
    if (-not $NoStart) {
        if (-not (Test-Path $PythonExe)) {
            throw "Python executable not found at: $PythonExe"
        }

        $proc = Start-Process -FilePath $PythonExe -ArgumentList "app.py" -WorkingDirectory $repoRoot -PassThru
        $startedHere = $true

        $booted = $false
        $deadline = [DateTime]::UtcNow.AddSeconds(30)
        $baseUri = [Uri]$BaseUrl
        while ([DateTime]::UtcNow -lt $deadline) {
            if ($proc.HasExited) {
                throw "Flask process exited before startup completed. ExitCode: $($proc.ExitCode)"
            }

            try {
                $client = New-Object System.Net.Sockets.TcpClient
                $task = $client.ConnectAsync($baseUri.Host, $baseUri.Port)
                if ($task.Wait(300) -and $client.Connected) {
                    $booted = $true
                    $client.Close()
                    break
                }
                $client.Close()
            }
            catch {
                # Retry until app is up.
            }
        }

        if (-not $booted) {
            throw "Server did not become ready at $BaseUrl"
        }
    }

    $pageResponse = Get-OkResponse -Url "$BaseUrl/" -Name "Homepage"
    if ($pageResponse.Content -notmatch "og:image") {
        throw "[FAIL] Homepage is missing og:image metadata"
    }
    if ($pageResponse.Content -notmatch "social-preview.png") {
        throw "[FAIL] Homepage is missing social-preview.png metadata"
    }
    Write-Host "[OK] Homepage contains OG image metadata"

    $healthResponse = Get-OkResponse -Url "$BaseUrl/api/health" -Name "Health endpoint"
    if ($healthResponse.Content -notmatch '"status"\s*:\s*"ok"|"status"\s*:\s*"warning"') {
        throw "[FAIL] Health endpoint response payload is unexpected"
    }
    Write-Host "[OK] Health payload shape is valid"

    $image = Get-OkResponse -Url "$BaseUrl/static/brand/social-preview.png" -Name "Social preview image"
    if ($image.RawContentLength -le 0) {
        throw "[FAIL] Social preview image response is empty"
    }
    Write-Host "[OK] Social preview image bytes: $($image.RawContentLength)"

    Write-Host "Smoke check completed successfully."
}
finally {
    if ($startedHere -and $proc -and -not $proc.HasExited) {
        Stop-Process -Id $proc.Id -Force
        Write-Host "Stopped temporary Flask process (PID $($proc.Id))."
    }
}

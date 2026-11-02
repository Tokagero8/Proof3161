# Shared implementation for the Windows .bat launchers; compatible with PowerShell 5.1.
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('start-app', 'stop-app', 'app-status', 'app-logs',
        'test-backend', 'test-frontend', 'test-browser', 'test-proxy')]
    [string]$Task
)

$ErrorActionPreference = 'Stop'
$exitCode = 0
$repoRoot = Split-Path -Parent $PSScriptRoot
$localCompose = @(
    'compose', '--project-directory', $repoRoot,
    '--env-file', (Join-Path $repoRoot '.env'),
    '-p', 'proof3161', '-f', (Join-Path $repoRoot 'compose.yaml')
)

function Require-Command([string]$Name, [string]$Hint) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "$Name is unavailable. $Hint"
    }
}

function Invoke-Checked([string]$Command, [string[]]$Arguments) {
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$Command failed with exit code $LASTEXITCODE."
    }
}

function Require-Docker {
    Require-Command 'docker' 'Install Docker Desktop and enable Linux containers.'
    $osType = & docker info --format '{{.OSType}}'
    if ($LASTEXITCODE -ne 0) {
        throw 'Docker is not ready. Start Docker Desktop and try again.'
    }
    if (($osType -join '').Trim() -ne 'linux') {
        throw 'This project requires Docker running Linux containers.'
    }
}

function Require-Compose {
    Require-Docker
    Invoke-Checked 'docker' @('compose', 'version')
}

function Require-Frontend([string[]]$Tools) {
    Require-Command 'node' 'Install Node.js 24.'
    Require-Command 'npm.cmd' 'Install Node.js 24 with npm.'
    foreach ($tool in $Tools) {
        if (-not (Test-Path -LiteralPath "node_modules/.bin/$tool.cmd" -PathType Leaf)) {
            throw 'Frontend dependencies are missing. Run npm.cmd ci in the frontend directory first.'
        }
    }
}

function Invoke-LocalApp {
    Require-Compose
    if (-not (Test-Path -LiteralPath '.env' -PathType Leaf)) {
        throw 'Create .env from .env.example and configure credentials and the trusted TSA root first.'
    }

    switch ($Task) {
        'start-app' {
            # Let Compose resolve interpolation and relative paths. Never print the
            # resulting configuration: it contains database passwords.
            $rawConfig = & docker @localCompose config --format json
            if ($LASTEXITCODE -ne 0) { throw 'Local Compose configuration is invalid.' }
            try {
                $config = ($rawConfig -join [Environment]::NewLine) | ConvertFrom-Json
            }
            catch { throw 'Could not read the resolved Compose configuration.' }
            $mount = @($config.services.backend.volumes | Where-Object {
                $_.target -eq '/run/certificates/tsa-root.pem' -and $_.type -eq 'bind'
            })
            if ($mount.Count -ne 1 -or
                -not (Test-Path -LiteralPath $mount[0].source -PathType Leaf)) {
                throw 'TSA_ROOT_CERT_FILE must point to an existing independently trusted CA certificate file.'
            }

            Invoke-Checked 'docker' ($localCompose + @('up', '-d', '--build', '--wait'))
            Invoke-Checked 'docker' ($localCompose + @('ps'))
            $port = $config.services.frontend.ports[0].published
            Write-Host "Open http://localhost:$port/"
        }
        'stop-app' {
            # Intentionally omit --volumes: application data must survive stopping.
            Invoke-Checked 'docker' ($localCompose + @('down'))
        }
        'app-status' { Invoke-Checked 'docker' ($localCompose + @('ps')) }
        'app-logs' {
            Write-Host 'Following application logs. Press Ctrl+C to stop following.'
            Invoke-Checked 'docker' ($localCompose + @('logs', '--follow', '--tail', '100'))
        }
    }
}

function Invoke-BackendTests {
    Require-Docker
    if ($env:JAVA_HOME) {
        if (-not (Test-Path -LiteralPath (Join-Path $env:JAVA_HOME 'bin/java.exe') -PathType Leaf)) {
            throw 'JAVA_HOME does not contain bin/java.exe. Configure a Java 25 JDK.'
        }
    }
    else { Require-Command 'java' 'Install a Java 25 JDK and set JAVA_HOME.' }

    $savedTsaUrl = $env:TSA_URL
    $savedTsaRoot = $env:TSA_TRUSTED_ROOT_PATH
    try {
        Remove-Item Env:\TSA_URL -ErrorAction SilentlyContinue
        Remove-Item Env:\TSA_TRUSTED_ROOT_PATH -ErrorAction SilentlyContinue
        Invoke-Checked '.\gradlew.bat' @('--no-daemon', 'test', 'offlineProofTest')
    }
    finally {
        $env:TSA_URL = $savedTsaUrl
        $env:TSA_TRUSTED_ROOT_PATH = $savedTsaRoot
    }
}

function Invoke-ProxyTests {
    Require-Compose
    $savedRoot = $env:PROOF3161_ROOT
    $savedTestDir = $env:NGINX_TEST_DIR
    $runId = [guid]::NewGuid().ToString('N')
    $testDir = Join-Path ([IO.Path]::GetTempPath()) "proof3161-proxy-$runId"
    $project = "proof3161-proxy-check-$runId"
    $proxyArgs = @(
        'compose', '-p', $project,
        '-f', (Join-Path $repoRoot 'deploy/tests/compose.yaml')
    )
    $stackAttempted = $false
    $cleanupSucceeded = $true

    try {
        New-Item -ItemType Directory -Path $testDir -ErrorAction Stop | Out-Null
        $env:PROOF3161_ROOT = $repoRoot.Replace('\', '/')
        $env:NGINX_TEST_DIR = $testDir.Replace('\', '/')
        $source = Get-Content -LiteralPath 'deploy/Caddyfile' -Raw
        $testConfig = $source.Replace('{$PUBLIC_DOMAIN} {', 'http://:8080 {')
        if ($testConfig -eq $source) { throw 'Expected Caddy site declaration was not found.' }
        [IO.File]::WriteAllText(
            (Join-Path $testDir 'Caddyfile'), $testConfig, [Text.UTF8Encoding]::new($false)
        )

        Invoke-Checked 'docker' ($proxyArgs + @('config', '--quiet'))
        $stackAttempted = $true
        Invoke-Checked 'docker' ($proxyArgs + @('up', '-d', '--build', '--wait'))

        $ready = $false
        for ($attempt = 0; $attempt -lt 30; $attempt++) {
            & docker @proxyArgs exec -T caddy wget -q -O /dev/null http://127.0.0.1:8080/index.html
            if ($LASTEXITCODE -eq 0) { $ready = $true; break }
            Start-Sleep -Seconds 1
        }
        if (-not $ready) { throw 'Test Caddy did not become ready.' }

        Invoke-Checked 'docker' ($proxyArgs + @('exec', '-T', 'frontend', 'nginx', '-t'))
        $scenarios = @(
            'functional',
            'rate-proof', 'aggregate-proof', 'concurrency-proof',
            'rate-verify', 'aggregate-verify', 'concurrency-verify'
        )
        foreach ($scenario in $scenarios) {
            # Fresh Nginx state keeps each rate/concurrency scenario independent.
            Invoke-Checked 'docker' ($proxyArgs + @(
                'up', '-d', '--no-deps', '--force-recreate', '--wait', 'frontend'
            ))
            Invoke-Checked 'docker' ($proxyArgs + @('run', '--rm', '--no-deps', 'check', $scenario))
        }
    }
    finally {
        try {
            if ($stackAttempted) {
                & docker @proxyArgs down
                $cleanupSucceeded = $LASTEXITCODE -eq 0
                if (-not $cleanupSucceeded) {
                    $script:exitCode = 1
                    Write-Warning "Proxy cleanup failed. Project: $project. Configuration retained at $testDir."
                }
            }
            if ($cleanupSucceeded -and (Test-Path -LiteralPath $testDir -PathType Container)) {
                # Delete only our generated file, then our empty directory; never recurse.
                [IO.File]::Delete((Join-Path $testDir 'Caddyfile'))
                [IO.Directory]::Delete($testDir, $false)
            }
        }
        finally {
            $env:PROOF3161_ROOT = $savedRoot
            $env:NGINX_TEST_DIR = $savedTestDir
        }
    }
}

Push-Location -LiteralPath $repoRoot
try {
    switch ($Task) {
        { $_ -in @('start-app', 'stop-app', 'app-status', 'app-logs') } {
            Invoke-LocalApp
        }
        'test-backend' { Invoke-BackendTests }
        'test-frontend' {
            Push-Location -LiteralPath (Join-Path $repoRoot 'frontend')
            try {
                Require-Frontend @('vitest', 'eslint', 'tsc', 'vite')
                Invoke-Checked 'npm.cmd' @('test')
                Invoke-Checked 'npm.cmd' @('run', 'lint')
                Invoke-Checked 'npm.cmd' @('run', 'build')
            }
            finally { Pop-Location }
        }
        'test-browser' {
            Push-Location -LiteralPath (Join-Path $repoRoot 'frontend')
            try {
                Require-Frontend @('playwright', 'vite', 'tsc')
                Invoke-Checked '.\node_modules\.bin\playwright.cmd' @(
                    'test', '--project=chromium', '--workers=1',
                    '--timeout=30000', '--global-timeout=600000'
                )
            }
            finally { Pop-Location }
        }
        'test-proxy' { Invoke-ProxyTests }
    }
}
catch {
    [Console]::Error.WriteLine("ERROR: $($_.Exception.Message)")
    $exitCode = 1
}
finally { Pop-Location }
exit $exitCode


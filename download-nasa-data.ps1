$ErrorActionPreference = 'Stop'
$investigationIds = @('PSI-98', 'PSI-99', 'PSI-100', 'PSI-101', 'PSI-102')
$outputDirectory = Join-Path $PSScriptRoot '..\data\nasa'
$outputDirectory = [System.IO.Path]::GetFullPath($outputDirectory)
$nasaApi = 'https://psi.nasa.gov/geode-py/ws'

New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
$manifest = @()

foreach ($id in $investigationIds) {
    $investigation = Invoke-RestMethod -Uri "$nasaApi/repo/investigations/$id" -TimeoutSec 30
    foreach ($table in $investigation.experimentalTable) {
        $fileName = [System.IO.Path]::GetFileName($table.file_name)
        if (-not $fileName.EndsWith('.csv')) {
            throw "Unexpected NASA table format: $fileName"
        }

        $encodedFile = [uri]::EscapeDataString($table.file_name)
        $downloadApi = "$nasaApi/studies/$id/download?file=$encodedFile&version=$($investigation.version)&redirect=true"
        $destination = Join-Path $outputDirectory $fileName
        Invoke-WebRequest -Uri $downloadApi -OutFile $destination -UseBasicParsing -TimeoutSec 60
        $content = Get-Content -LiteralPath $destination -Raw
        if ($content.Length -gt 10000000) {
            Remove-Item -LiteralPath $destination
            throw "Refusing unexpectedly large table: $fileName"
        }

        $entry = [ordered]@{
            investigationId = $id
            title = $investigation.title
            doi = $investigation.doi
            license = $investigation.licenseIdentifier
            source = "https://psi.nasa.gov/physci/repo/data/investigations/$id"
            file = $fileName
            bytes = (Get-Item -LiteralPath $destination).Length
            rows = (@($content -split "`r?`n" | Where-Object { $_.Trim() }).Count - 1)
        }
        $manifest += [pscustomobject]$entry
        Write-Host "$id : $($entry.rows) rows, $($entry.bytes) bytes ($fileName)"
    }
}

$manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $outputDirectory 'manifest.json') -Encoding utf8
Write-Host "Saved $($manifest.Count) NASA PSI tables to data/nasa."
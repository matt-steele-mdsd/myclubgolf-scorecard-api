# Deploy script for phoneAI server
# Usage: .\deploy.ps1

Write-Host "Deploy Script" -ForegroundColor Cyan
Write-Host ""

# Step 1: Clean dist folder
Write-Host "Cleaning dist folder..." -ForegroundColor Yellow
if (Test-Path dist) {
    Remove-Item -Recurse -Force dist
}

# Step 2: Compile TypeScript
Write-Host "Compiling TypeScript..." -ForegroundColor Yellow
npx tsc -p tsconfig.server.json
if ($LASTEXITCODE -ne 0) { exit 1 }

# Step 3: Create zip for upload
Write-Host "Creating dist.zip..." -ForegroundColor Yellow
if (Test-Path dist.zip) { Remove-Item dist.zip }
Compress-Archive -Path dist -DestinationPath dist.zip

Write-Host ""
Write-Host "Deploy package ready!" -ForegroundColor Cyan

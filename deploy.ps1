<#
Deploy to GitHub Pages via the gh-pages branch (no CI needed).

Usage:
  pwsh -File deploy.ps1
  pwsh -File deploy.ps1 -Repo "owner/name"

Steps:
  1. tsc --noEmit (stop on failure)
  2. vite build into dist/
  3. init a throwaway repo inside dist/ and force-push it to gh-pages
  4. make sure Pages is served from gh-pages (enable on first run)
  5. print the public URL

Requires: gh already logged in (git credentials come from gh auth setup-git).
#>
param(
  [string]$Repo = "Freakwuji/taijie"
)

$ErrorActionPreference = 'Stop'
$P = Split-Path -Parent $MyInvocation.MyCommand.Path
$node = 'C:\Users\wujij\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe'
$pnpm = 'C:\Users\wujij\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\pnpm\bin\pnpm.mjs'

Set-Location $P

Write-Host '[1/5] typecheck' -ForegroundColor Cyan
& $node 'node_modules\typescript\bin\tsc' --noEmit -p 'tsconfig.json'
if ($LASTEXITCODE -ne 0) { throw "tsc failed ($LASTEXITCODE)" }

Write-Host '[2/5] build' -ForegroundColor Cyan
& $node $pnpm build
if ($LASTEXITCODE -ne 0) { throw "build failed ($LASTEXITCODE)" }
if (-not (Test-Path (Join-Path $P 'dist\index.html'))) { throw 'dist/index.html missing' }

Write-Host '[3/5] push gh-pages' -ForegroundColor Cyan
Set-Location (Join-Path $P 'dist')
if (Test-Path '.git') { Remove-Item '.git' -Recurse -Force }
New-Item -ItemType File -Name '.nojekyll' -Force | Out-Null
git init -q -b gh-pages
git add -A
$stamp = Get-Date -Format 'yyyy-MM-dd HH:mm'
git -c user.name="Freakwuji" -c user.email="3077348941@qq.com" commit -q -m "deploy $stamp"
git remote add origin "https://github.com/$Repo.git"
git push -q -f origin gh-pages
if ($LASTEXITCODE -ne 0) { throw 'push failed: check gh auth and that the repo exists' }
Remove-Item '.git' -Recurse -Force
Set-Location $P

Write-Host '[4/5] enable pages' -ForegroundColor Cyan
gh api "repos/$Repo/pages" 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
  gh api -X POST "repos/$Repo/pages" -f 'source[branch]=gh-pages' -f 'source[path]=/' 2>&1 | Out-Null
  Write-Host '  pages enabled'
} else {
  gh api -X PUT "repos/$Repo/pages" -f 'source[branch]=gh-pages' -f 'source[path]=/' 2>&1 | Out-Null
  Write-Host '  pages already on; source re-pointed to gh-pages'
}

Write-Host '[5/5] result' -ForegroundColor Cyan
$owner = ($Repo -split '/')[0].ToLower()
$name = ($Repo -split '/')[1].ToLower()
if ($name -eq "$owner.github.io") {
  $url = "https://$owner.github.io/"
} else {
  $url = "https://$owner.github.io/$name/"
}
Write-Host "repo: https://github.com/$Repo" -ForegroundColor Green
Write-Host "site: $url" -ForegroundColor Green
Write-Host 'First publish takes about 1-3 minutes; later updates are near-instant.'

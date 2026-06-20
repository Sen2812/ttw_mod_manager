# Render build/icon.svg shapes to 1024x1024 PNG (no external deps).
Add-Type -AssemblyName System.Drawing

$buildPath = Join-Path $PSScriptRoot "../build/icon.png"
$publicPath = Join-Path $PSScriptRoot "../public/icon.png"

function New-Color($hex) {
  $hex = $hex.TrimStart('#')
  return [System.Drawing.Color]::FromArgb(
    255,
    [Convert]::ToInt32($hex.Substring(0, 2), 16),
    [Convert]::ToInt32($hex.Substring(2, 2), 16),
    [Convert]::ToInt32($hex.Substring(4, 2), 16)
  )
}

function Fill-RoundedRect($g, $brush, $x, $y, $w, $h, $r) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $path.AddArc($x, $y, $d, $d, 180, 90)
  $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $path.CloseFigure()
  $g.FillPath($brush, $path)
  $path.Dispose()
}

$bmp = New-Object System.Drawing.Bitmap 1024, 1024
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.Clear((New-Color "#F5F0EB"))

Fill-RoundedRect $g (New-Object System.Drawing.SolidBrush (New-Color "#B0A89E")) 272 592 480 112 28
Fill-RoundedRect $g (New-Object System.Drawing.SolidBrush (New-Color "#8B7E74")) 240 456 480 112 28
Fill-RoundedRect $g (New-Object System.Drawing.SolidBrush (New-Color "#8FA68E")) 208 320 480 112 28
$g.FillEllipse((New-Object System.Drawing.SolidBrush (New-Color "#F5F0EB")), 580, 348, 56, 56)

$bmp.Save($buildPath, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Save($publicPath, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$bmp.Dispose()

Write-Host "Rendered 1024x1024 icon from vector spec"

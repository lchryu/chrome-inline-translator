Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$outDir = Join-Path $root "assets\icons"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

function New-RoundedRectPath {
  param(
    [float]$X,
    [float]$Y,
    [float]$Width,
    [float]$Height,
    [float]$Radius
  )

  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $diameter = $Radius * 2
  $rect = [System.Drawing.RectangleF]::new($X, $Y, $diameter, $diameter)
  $path.AddArc($rect, 180, 90)
  $rect.X = $X + $Width - $diameter
  $path.AddArc($rect, 270, 90)
  $rect.Y = $Y + $Height - $diameter
  $path.AddArc($rect, 0, 90)
  $rect.X = $X
  $path.AddArc($rect, 90, 90)
  $path.CloseFigure()
  return $path
}

function New-Icon {
  param([int]$Size)

  $bitmap = [System.Drawing.Bitmap]::new($Size, $Size)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $graphics.Clear([System.Drawing.Color]::Transparent)

  $scale = $Size / 128.0
  $pad = 8 * $scale
  $radius = 28 * $scale
  $cardPath = New-RoundedRectPath $pad $pad ($Size - $pad * 2) ($Size - $pad * 2) $radius

  $backgroundRect = [System.Drawing.RectangleF]::new($pad, $pad, ($Size - $pad * 2), ($Size - $pad * 2))
  $backgroundBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    $backgroundRect,
    [System.Drawing.Color]::FromArgb(255, 20, 184, 166),
    [System.Drawing.Color]::FromArgb(255, 132, 204, 22),
    35
  )
  $graphics.FillPath($backgroundBrush, $cardPath)

  $shineBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(58, 255, 255, 255))
  $shinePath = New-RoundedRectPath (16 * $scale) (13 * $scale) (74 * $scale) (38 * $scale) (18 * $scale)
  $graphics.FillPath($shineBrush, $shinePath)

  $bubbleBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(245, 255, 255, 255))
  $bubblePath = New-RoundedRectPath (29 * $scale) (30 * $scale) (70 * $scale) (68 * $scale) (18 * $scale)
  $graphics.FillPath($bubbleBrush, $bubblePath)

  $tail = New-Object System.Drawing.Drawing2D.GraphicsPath
  $tail.AddPolygon([System.Drawing.PointF[]]@(
    ([System.Drawing.PointF]::new(80 * $scale, 91 * $scale)),
    ([System.Drawing.PointF]::new(103 * $scale, 104 * $scale)),
    ([System.Drawing.PointF]::new(92 * $scale, 79 * $scale))
  ))
  $graphics.FillPath($bubbleBrush, $tail)

  $fontSize = [Math]::Max(11, [Math]::Round(58 * $scale))
  $font = New-Object System.Drawing.Font("Segoe UI", $fontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $textBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 14, 116, 144))
  $format = New-Object System.Drawing.StringFormat
  $format.Alignment = [System.Drawing.StringAlignment]::Center
  $format.LineAlignment = [System.Drawing.StringAlignment]::Center
  $textRect = [System.Drawing.RectangleF]::new(28 * $scale, 29 * $scale, 72 * $scale, 69 * $scale)
  $graphics.DrawString("T", $font, $textBrush, $textRect, $format)

  $sparkBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(245, 255, 255, 255))
  $graphics.FillEllipse($sparkBrush, 94 * $scale, 20 * $scale, 10 * $scale, 10 * $scale)
  $graphics.FillEllipse($sparkBrush, 22 * $scale, 96 * $scale, 8 * $scale, 8 * $scale)

  $file = Join-Path $outDir "icon-$Size.png"
  $bitmap.Save($file, [System.Drawing.Imaging.ImageFormat]::Png)

  $graphics.Dispose()
  $bitmap.Dispose()
  $backgroundBrush.Dispose()
  $shineBrush.Dispose()
  $bubbleBrush.Dispose()
  $textBrush.Dispose()
  $sparkBrush.Dispose()
  $font.Dispose()
  $format.Dispose()
  $cardPath.Dispose()
  $shinePath.Dispose()
  $bubblePath.Dispose()
  $tail.Dispose()
}

16, 32, 48, 128 | ForEach-Object { New-Icon $_ }

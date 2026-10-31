Add-Type -AssemblyName System.Drawing

$canvas = [System.Drawing.Bitmap]::new(512, 512)
$graphics = [System.Drawing.Graphics]::FromImage($canvas)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#dff3f7'))

function New-Brush([string]$hex) {
  return [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml($hex))
}

$waveBrush = New-Brush '#b9e1ea'
$deepBrush = New-Brush '#a7d3de'
$fishBrush = New-Brush '#f3b8ca'
$finBrush = New-Brush '#e99fb9'
$eyeBrush = New-Brush '#456273'
$bubbleBrush = New-Brush '#fffaf8'

$graphics.FillPolygon($waveBrush, [System.Drawing.PointF[]]@(
  [System.Drawing.PointF]::new(0, 333), [System.Drawing.PointF]::new(100, 318),
  [System.Drawing.PointF]::new(205, 334), [System.Drawing.PointF]::new(320, 340),
  [System.Drawing.PointF]::new(420, 318), [System.Drawing.PointF]::new(512, 312),
  [System.Drawing.PointF]::new(512, 512), [System.Drawing.PointF]::new(0, 512)
))
$graphics.FillPolygon($deepBrush, [System.Drawing.PointF[]]@(
  [System.Drawing.PointF]::new(0, 390), [System.Drawing.PointF]::new(110, 376),
  [System.Drawing.PointF]::new(250, 399), [System.Drawing.PointF]::new(390, 398),
  [System.Drawing.PointF]::new(512, 376), [System.Drawing.PointF]::new(512, 512),
  [System.Drawing.PointF]::new(0, 512)
))

$graphics.FillPolygon($fishBrush, [System.Drawing.PointF[]]@(
  [System.Drawing.PointF]::new(121, 265), [System.Drawing.PointF]::new(61, 212),
  [System.Drawing.PointF]::new(61, 318)
))
$graphics.FillPolygon($finBrush, [System.Drawing.PointF[]]@(
  [System.Drawing.PointF]::new(181, 207), [System.Drawing.PointF]::new(218, 147),
  [System.Drawing.PointF]::new(252, 202)
))
$graphics.FillEllipse($fishBrush, 105, 187, 280, 158)
$graphics.FillPolygon($finBrush, [System.Drawing.PointF[]]@(
  [System.Drawing.PointF]::new(183, 329), [System.Drawing.PointF]::new(220, 373),
  [System.Drawing.PointF]::new(258, 330)
))
$graphics.FillEllipse($eyeBrush, 304, 237, 24, 24)
$graphics.FillEllipse([System.Drawing.Brushes]::White, 312, 242, 8, 8)
$mouthPen = [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml('#456273'), 7)
$mouthPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$mouthPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$graphics.DrawArc($mouthPen, 324, 273, 43, 25, 10, 160)
$graphics.FillEllipse($bubbleBrush, 64, 111, 26, 26)
$graphics.FillEllipse($bubbleBrush, 113, 81, 16, 16)
$graphics.FillEllipse($bubbleBrush, 398, 107, 20, 20)

$canvas.Save((Join-Path $PSScriptRoot 'app-icon-512.png'), [System.Drawing.Imaging.ImageFormat]::Png)
foreach ($size in @(192, 180)) {
  $target = [System.Drawing.Bitmap]::new($size, $size)
  $targetGraphics = [System.Drawing.Graphics]::FromImage($target)
  $targetGraphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $targetGraphics.DrawImage($canvas, 0, 0, $size, $size)
  $target.Save((Join-Path $PSScriptRoot "app-icon-$size.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  $targetGraphics.Dispose()
  $target.Dispose()
}

$mouthPen.Dispose()
foreach ($brush in @($waveBrush, $deepBrush, $fishBrush, $finBrush, $eyeBrush, $bubbleBrush)) { $brush.Dispose() }
$graphics.Dispose()
$canvas.Dispose()

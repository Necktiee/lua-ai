# Build final อีแจ๋ว LINE Rich Menu (2500x1686) from lineMenu.png
# Upscales source, covers wrong Thai labels, stamps correct labels, saves to assets/.
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = 'C:\Users\nextzus\Documents\เลขา'
$src  = Join-Path $root 'lineMenu.png'
$out  = Join-Path $root 'assets\richmenu-jaew.png'
New-Item -ItemType Directory -Force -Path (Join-Path $root 'assets') | Out-Null

# Geometry at target resolution
$W = 2500; $H = 1686
$rowH = 843
$cols = @(0, 833, 1667, 2500)  # column x-boundaries (833/834/833)

$bgHex = '#FEFAF1'
$bg = [System.Drawing.ColorTranslator]::FromHtml($bgHex)
$ink = [System.Drawing.ColorTranslator]::FromHtml('#232323')
$accent = [System.Drawing.ColorTranslator]::FromHtml('#0E8A6A')  # jade

# Label per cell index (0..5 reading order: TL,TC,TR,BL,BC,BR)
$labels = @('คุยกับแจ๋ว','เพิ่มงาน','เตือนฉัน','วันนี้','ปฏิทิน','เปิดอีแจ๋ว')

# Load source and upscale
$srcImg = [System.Drawing.Image]::FromFile($src)
$canvas = New-Object System.Drawing.Bitmap($W, $H)
$g = [System.Drawing.Graphics]::FromImage($canvas)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.DrawImage($srcImg, 0, 0, $W, $H)
$srcImg.Dispose()

# Font: Thai-capable. Leelawadee UI ships on Windows 10/11.
$fontNames = @('Leelawadee UI','Tahoma','Leelawadee','Microsoft Sans Serif')
$fontFamily = $null
foreach ($n in $fontNames) {
  try { $fontFamily = New-Object System.Drawing.FontFamily($n); if ($fontFamily.Name -eq $n) { break } } catch { $fontFamily = $null }
}
if (-not $fontFamily) { $fontFamily = [System.Drawing.FontFamily]::GenericSansSerif }
$font = New-Object System.Drawing.Font($fontFamily, 72, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$brushBg = New-Object System.Drawing.SolidBrush($bg)
$brushInk = New-Object System.Drawing.SolidBrush($ink)
$sf = New-Object System.Drawing.StringFormat
$sf.Alignment = [System.Drawing.StringAlignment]::Center
$sf.LineAlignment = [System.Drawing.StringAlignment]::Center

# Cover + stamp each label band
for ($i = 0; $i -lt 6; $i++) {
  $col = $i % 3
  $row = [int]([math]::Floor($i / 3))
  $x0 = $cols[$col]
  $x1 = $cols[$col + 1]
  $yTop = $row * $rowH
  $cellW = $x1 - $x0
  # Cover band: lower-middle of cell where the wrong label sits
  $bandH = 180
  $bandY = $yTop + 560
  $bandX = $x0 + 40
  $bandW = $cellW - 80
  $g.FillRectangle($brushBg, $bandX, $bandY, $bandW, $bandH)
  # Stamp correct label, centered in the cover band
  $rect = New-Object System.Drawing.RectangleF($bandX, $bandY, $bandW, $bandH)
  $g.DrawString($labels[$i], $font, $brushInk, $rect, $sf)
}

# Subtle jade accent underline under each label for cohesion
$pen = New-Object System.Drawing.Pen($accent, 6)
for ($i = 0; $i -lt 6; $i++) {
  $col = $i % 3
  $row = [int]([math]::Floor($i / 3))
  $x0 = $cols[$col]; $x1 = $cols[$col + 1]
  $yTop = $row * $rowH
  $cx0 = $x0 + [int](($x1 - $x0)/2) - 90
  $cy0 = $yTop + 768
  $g.DrawEllipse($pen, $cx0, $cy0, 180, 12)  # small dot motif under label
}

$font.Dispose(); $fontFamily.Dispose()
$brushBg.Dispose(); $brushInk.Dispose(); $pen.Dispose(); $sf.Dispose()
$g.Dispose()

# Save as high-quality PNG
$enc = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/png' }
$params = New-Object System.Drawing.Imaging.EncoderParameters(1)
$params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [int64]100)
$canvas.Save($out, $enc, $params)
$canvas.Dispose()

$fi = Get-Item $out
Write-Output ("Saved: {0} ({1} bytes)" -f $out, $fi.Length)

param(
  [Parameter(Mandatory = $true)]
  [int]$ProcessId,

  [Parameter(Mandatory = $true)]
  [string]$OutputPath,

  [int]$SkipTopPixels = 49,

  [int]$CaptureWidth = 1000,

  [Parameter(Mandatory = $true)]
  [int]$CaptureHeight
)

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

namespace LoxerDocumentationCapture {
    public static class NativeMethods {
        [DllImport("user32.dll")]
        public static extern IntPtr GetForegroundWindow();

        [DllImport("user32.dll")]
        public static extern bool SetForegroundWindow(IntPtr handle);

        [DllImport("user32.dll")]
        public static extern bool ShowWindow(IntPtr handle, int command);

        [DllImport("user32.dll")]
        public static extern uint GetWindowThreadProcessId(IntPtr handle, out uint processId);

        [DllImport("user32.dll")]
        public static extern bool GetClientRect(IntPtr handle, out Rect rectangle);

        [DllImport("user32.dll")]
        public static extern bool ClientToScreen(IntPtr handle, ref Point point);
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct Point {
        public int X;
        public int Y;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct Rect {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }
}
'@
Add-Type -AssemblyName System.Drawing

$process = Get-Process -Id $ProcessId -ErrorAction Stop
for ($attempt = 0; $attempt -lt 30 -and $process.MainWindowHandle -eq 0; $attempt += 1) {
  Start-Sleep -Milliseconds 100
  $process.Refresh()
}
if ($process.MainWindowHandle -eq 0) {
  throw "Windows Terminal process $ProcessId has no window to capture."
}

[void][LoxerDocumentationCapture.NativeMethods]::ShowWindow($process.MainWindowHandle, 9)
[void][LoxerDocumentationCapture.NativeMethods]::SetForegroundWindow($process.MainWindowHandle)

for ($attempt = 0; $attempt -lt 150; $attempt += 1) {
  # CopyFromScreen reads the visible desktop, not the terminal's off-screen surface. Do not let a
  # background or not-yet-rendered terminal overwrite a good documentation image.
  $windowHandle = [LoxerDocumentationCapture.NativeMethods]::GetForegroundWindow()
  $foregroundProcessId = [uint32]0
  [void][LoxerDocumentationCapture.NativeMethods]::GetWindowThreadProcessId($windowHandle, [ref]$foregroundProcessId)
  if ($foregroundProcessId -ne $ProcessId) {
    Start-Sleep -Milliseconds 100
    continue
  }

  $rectangle = [LoxerDocumentationCapture.Rect]::new()
  if (-not [LoxerDocumentationCapture.NativeMethods]::GetClientRect($windowHandle, [ref]$rectangle)) {
    Start-Sleep -Milliseconds 100
    continue
  }
  $origin = [LoxerDocumentationCapture.Point]::new()
  if (-not [LoxerDocumentationCapture.NativeMethods]::ClientToScreen($windowHandle, [ref]$origin)) {
    Start-Sleep -Milliseconds 100
    continue
  }
  $width = [Math]::Min($CaptureWidth, $rectangle.Right - $rectangle.Left)
  $height = [Math]::Min($CaptureHeight, $rectangle.Bottom - $rectangle.Top - $SkipTopPixels)

  $bitmap = [System.Drawing.Bitmap]::new($width, $height)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  try {
    $graphics.CopyFromScreen($origin.X, $origin.Y + $SkipTopPixels, 0, 0, $bitmap.Size)
    $visibleTextPixels = 0
    for ($y = 0; $y -lt $height; $y += 2) {
      for ($x = 0; $x -lt $width; $x += 2) {
        $pixel = $bitmap.GetPixel($x, $y)
        if ($pixel.R -gt 80 -or $pixel.G -gt 80 -or $pixel.B -gt 80) {
          $visibleTextPixels += 1
        }
      }
    }
    if ($visibleTextPixels -ge 80) {
      $bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
      return
    }
  } finally {
    $graphics.Dispose()
    $bitmap.Dispose()
  }
  Start-Sleep -Milliseconds 100
}

throw 'The foreground terminal did not render enough visible output. The existing image was kept.'

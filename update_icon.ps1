Add-Type -AssemblyName System.Drawing
$inputFile = "C:\Users\ahmad\.gemini\antigravity\brain\898ec62e-38e9-4661-b854-1fd6e52bbb46\white_bg_icon_v2_1767659913778.png"
$outputFile = "e:\My Projects\game-request-generator\public\my-icon.png"
Write-Host "Reading from: $inputFile"
$img = [System.Drawing.Image]::FromFile($inputFile)
Write-Host "Saving to: $outputFile"
$img.Save($outputFile, [System.Drawing.Imaging.ImageFormat]::Png)
$img.Dispose()
Write-Host "Icon updated successfully"

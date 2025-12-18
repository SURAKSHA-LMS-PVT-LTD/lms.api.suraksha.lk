$file = "src/modules/institute_mudules/institue_user/institue_user.service.ts"
$content = Get-Content $file -Raw

# Simple non-greedy replacement - match the exact pattern 3 times
$content = $content -replace '(?s)if \(image\) \{\s+try \{.+?console\.warn\(`Image upload failed for \w+ \$\{\w+\.id\}: \$\{imageError\.message\}`\);\s+\}\s+\}', @'
if (image) {
        if (typeof image === 'string') {
          // URL from /upload/verify-and-publish
          imageUrl = image;
          imageStatus = verifiedById ? ImageVerificationStatus.VERIFIED : ImageVerificationStatus.PENDING;
        } else {
          throw new BadRequestException('File upload is deprecated. Use imageUrl from /upload/verify-and-publish.');
        }
      }
'@

Set-Content $file $content -NoNewline
Write-Host "Fixed 3 occurrences in institute_user.service.ts"

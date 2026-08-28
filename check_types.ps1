$result = node node_modules/typescript/bin/tsc --noEmit --pretty false 2>&1
"---TSC OUTPUT START---" | Out-File -FilePath tsc_result.txt -Encoding utf8
$result | Out-File -FilePath tsc_result.txt -Append -Encoding utf8
"---TSC OUTPUT END---" | Out-File -FilePath tsc_result.txt -Append -Encoding utf8
"EXITCODE=$LASTEXITCODE" | Out-File -FilePath tsc_result.txt -Append -Encoding utf8

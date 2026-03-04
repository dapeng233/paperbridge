# SciTools Word Bridge - COM Automation for Citation Management
# Uses ADDIN Field Codes (wdFieldAddin = 88) like Zotero/EndNote
# Field code stores metadata: "ADDIN SciToolsCite_<refIds>"
# Field result shows formatted text, user can freely change font/size/color
param(
    [string]$Action,
    [string]$JsonData = "",
    [string]$JsonFile = ""
)

$ErrorActionPreference = 'Stop'
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

if ($JsonFile -ne "" -and (Test-Path $JsonFile)) {
    $JsonData = Get-Content -Path $JsonFile -Raw -Encoding UTF8
}

$CITE_PREFIX = "ADDIN SciToolsCite_"
$BIBLIO_CODE = "ADDIN SciToolsBibliography"
$WD_FIELD_ADDIN = 88

function Get-WordApp {
    try {
        $w = [System.Runtime.InteropServices.Marshal]::GetActiveObject('Word.Application')
        return $w
    } catch {
        return $null
    }
}

function Ensure-WordApp {
    $w = Get-WordApp
    if ($null -eq $w) {
        try {
            $w = New-Object -ComObject Word.Application
            $w.Visible = $true
            $w.Documents.Add() | Out-Null
        } catch {
            Write-Output '{"success":false,"error":"cannot start Word"}'
            exit 1
        }
    }
    if ($w.Documents.Count -eq 0) {
        $w.Documents.Add() | Out-Null
    }
    return $w
}

function Do-CheckStatus {
    $w = Get-WordApp
    if ($null -eq $w) {
        Write-Output '{"success":true,"running":false}'
        return
    }
    $n = $w.Documents.Count
    $name = ""
    if ($n -gt 0) { $name = $w.ActiveDocument.Name }
    $safe = $name.Replace('\','\\').Replace('"','\"')
    Write-Output ('{"success":true,"running":true,"documents":' + $n + ',"activeDoc":"' + $safe + '"}')
}

function Do-InsertCitation {
    $data = $JsonData | ConvertFrom-Json
    $w = Ensure-WordApp
    $doc = $w.ActiveDocument
    $sel = $w.Selection
    $citeText = $data.citeText
    $refIdsList = @()
    foreach ($rid in $data.refIds) { $refIdsList += $rid.ToString() }
    $tag = "SciToolsCite_" + ($refIdsList -join ",")

    # Move cursor out of any existing SciTools ADDIN field
    try {
        $checkRange = $sel.Range
        if ($checkRange.Fields.Count -gt 0) {
            foreach ($f in $checkRange.Fields) {
                if ($f.Type -eq $WD_FIELD_ADDIN) {
                    $code = $f.Code.Text.Trim()
                    if ($code.StartsWith($CITE_PREFIX) -or $code -eq $BIBLIO_CODE) {
                        $newPos = $f.Result.End + 1
                        if ($newPos -le $doc.Content.End) {
                            $sel.Start = $newPos
                            $sel.End = $newPos
                        }
                        break
                    }
                }
            }
        }
    } catch { }

    # Insert ADDIN field at cursor position
    # Fields.Add(Range, Type, Text, PreserveFormatting)
    # Type 88 = wdFieldAddin, Text becomes part of field code after "ADDIN"
    $range = $sel.Range
    $field = $doc.Fields.Add($range, $WD_FIELD_ADDIN, $tag, $false)

    # Ensure field shows result (not field codes)
    if ($field.ShowCodes) {
        $field.ShowCodes = $false
    }

    # Set the displayed text (user can freely format this)
    $field.Result.Text = $citeText

    # Move cursor after the field
    try {
        $afterPos = $field.Result.End + 1
        if ($afterPos -le $doc.Content.End) {
            $sel.Start = $afterPos
            $sel.End = $afterPos
        }
    } catch { }

    Write-Output '{"success":true}'
}

function Do-ScanBibliography {
    $w = Get-WordApp
    if ($null -eq $w -or $w.Documents.Count -eq 0) {
        Write-Output '{"success":true,"refIds":[],"count":0}'
        return
    }
    $doc = $w.ActiveDocument
    $allIds = [System.Collections.ArrayList]@()
    foreach ($field in $doc.Fields) {
        if ($field.Type -eq $WD_FIELD_ADDIN) {
            $code = $field.Code.Text.Trim()
            if ($code.StartsWith($CITE_PREFIX)) {
                $idsStr = $code.Substring($CITE_PREFIX.Length).Trim()
                $ids = $idsStr -split ","
                foreach ($id in $ids) {
                    $id = $id.Trim()
                    if ($id -ne "" -and -not $allIds.Contains($id)) {
                        $allIds.Add($id) | Out-Null
                    }
                }
            }
        }
    }
    if ($allIds.Count -eq 0) {
        Write-Output '{"success":true,"refIds":[],"count":0}'
        return
    }
    $json = ($allIds | ForEach-Object { $_ }) -join ","
    Write-Output ('{"success":true,"refIds":[' + $json + '],"count":' + $allIds.Count + '}')
}

function Do-WriteBibliography {
    $data = $JsonData | ConvertFrom-Json
    $w = Ensure-WordApp
    $doc = $w.ActiveDocument
    $btext = $data.bibliography

    # Find existing bibliography ADDIN field
    $existing = $null
    foreach ($field in $doc.Fields) {
        if ($field.Type -eq $WD_FIELD_ADDIN) {
            $code = $field.Code.Text.Trim()
            if ($code -eq $BIBLIO_CODE) {
                $existing = $field
                break
            }
        }
    }

    if ($null -ne $existing) {
        # Update existing bibliography field
        $existing.Result.Text = $btext
    } else {
        # Insert at end of document
        $endRange = $doc.Content
        $endPos = $endRange.End - 1
        $insertRange = $doc.Range($endPos, $endPos)

        # Add heading "References" as plain text
        $insertRange.InsertParagraphAfter()
        $insertRange.Collapse(0)  # wdCollapseEnd = 0
        $insertRange.Text = "References"
        $insertRange.Font.Bold = $true
        $insertRange.Font.Size = 14
        $insertRange.InsertParagraphAfter()
        $insertRange.Collapse(0)

        # Reset font for bibliography
        $insertRange.Font.Bold = $false
        $insertRange.Font.Size = $doc.Styles.Item(-1).Font.Size  # wdStyleNormal = -1

        # Insert bibliography as ADDIN field
        $field = $doc.Fields.Add($insertRange, $WD_FIELD_ADDIN, "SciToolsBibliography", $false)
        if ($field.ShowCodes) {
            $field.ShowCodes = $false
        }
        $field.Result.Text = $btext
    }
    Write-Output '{"success":true}'
}

function Do-UpdateAllCitations {
    $data = $JsonData | ConvertFrom-Json
    $w = Get-WordApp
    if ($null -eq $w -or $w.Documents.Count -eq 0) {
        Write-Output '{"success":false,"error":"Word not open"}'
        return
    }
    $doc = $w.ActiveDocument
    $updated = 0
    foreach ($field in $doc.Fields) {
        if ($field.Type -eq $WD_FIELD_ADDIN) {
            $code = $field.Code.Text.Trim()
            if ($code.StartsWith($CITE_PREFIX)) {
                $ids = $code.Substring($CITE_PREFIX.Length).Trim()
                foreach ($cite in $data.citations) {
                    if ($cite.refIds -eq $ids) {
                        $field.Result.Text = $cite.text
                        $updated++
                        break
                    }
                }
            }
        }
    }
    Write-Output ('{"success":true,"updated":' + $updated + '}')
}

function Do-GetAllCitations {
    $w = Get-WordApp
    if ($null -eq $w -or $w.Documents.Count -eq 0) {
        Write-Output '{"success":true,"citations":[]}'
        return
    }
    $doc = $w.ActiveDocument
    $arr = @()
    $idx = 0
    foreach ($field in $doc.Fields) {
        if ($field.Type -eq $WD_FIELD_ADDIN) {
            $code = $field.Code.Text.Trim()
            if ($code.StartsWith($CITE_PREFIX)) {
                $ids = $code.Substring($CITE_PREFIX.Length).Trim()
                $txt = $field.Result.Text
                $txt = $txt.Replace('\','\\').Replace('"','\"').Replace("`r","").Replace("`n","")
                $arr += ('{"refIds":"' + $ids + '","text":"' + $txt + '","index":' + $idx + '}')
                $idx++
            }
        }
    }
    Write-Output ('{"success":true,"citations":[' + ($arr -join ",") + ']}')
}

function Do-RemoveCitations {
    # Remove all SciTools fields from the document, keeping the displayed text
    $w = Get-WordApp
    if ($null -eq $w -or $w.Documents.Count -eq 0) {
        Write-Output '{"success":false,"error":"Word not open"}'
        return
    }
    $doc = $w.ActiveDocument
    $removed = 0
    # Iterate in reverse to avoid index shifting issues
    for ($i = $doc.Fields.Count; $i -ge 1; $i--) {
        $field = $doc.Fields.Item($i)
        if ($field.Type -eq $WD_FIELD_ADDIN) {
            $code = $field.Code.Text.Trim()
            if ($code.StartsWith($CITE_PREFIX) -or $code -eq $BIBLIO_CODE) {
                $field.Unlink()  # Converts field to plain text, preserving the displayed text
                $removed++
            }
        }
    }
    Write-Output ('{"success":true,"removed":' + $removed + '}')
}

switch ($Action) {
    "check-status"         { Do-CheckStatus }
    "insert-citation"      { Do-InsertCitation }
    "update-bibliography"  { Do-ScanBibliography }
    "write-bibliography"   { Do-WriteBibliography }
    "update-all-citations" { Do-UpdateAllCitations }
    "get-all-citations"    { Do-GetAllCitations }
    "remove-citations"     { Do-RemoveCitations }
    default { Write-Output ('{"success":false,"error":"Unknown: ' + $Action + '"}') }
}

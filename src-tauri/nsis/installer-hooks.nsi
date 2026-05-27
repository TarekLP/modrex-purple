; Modrex installer hooks
;
; Runs the existing uninstaller before installing new files.
; On Electron->Tauri migration this removes the old "PD3 Mod Manager" files from
; wherever the user installed it (not just the default path).
; On subsequent Tauri->Tauri updates it does a clean file swap.
; App data (%APPDATA%\Modrex\) is never touched by the uninstaller.

!macro NSIS_HOOK_PREINSTALL
    ; UninstallString is set by the previous installer and already includes surrounding quotes,
    ; e.g. "C:\Users\...\Uninstall PD3 Mod Manager.exe"
    ; Reading it here before Tauri overwrites the registry key below.
    ReadRegStr $R0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\io.github.shulhaoleh.pd3modmanager" "UninstallString"
    ${If} $R0 != ""
        ExecWait '$R0 /S'
    ${EndIf}
!macroend

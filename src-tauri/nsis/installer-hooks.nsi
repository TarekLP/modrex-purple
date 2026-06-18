; Modrex installer hooks
;
; Runs the existing uninstaller before installing new files, covering the full
; upgrade chain: Electron ("PD3 Mod Manager") -> Tauri old identifier -> current.
; App data (%APPDATA%\modrex\) is never touched by the uninstaller.

!macro NSIS_HOOK_PREINSTALL
    ; Handle old Tauri identifier (v0.4.0 – v0.9.x)
    ReadRegStr $R0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\io.github.shulhaoleh.pd3modmanager" "UninstallString"
    ${If} $R0 != ""
        ExecWait '$R0 /S'
    ${EndIf}
!macroend

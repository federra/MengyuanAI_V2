; First-time installs may need Microsoft's x64 runtime for workerd.
; Show the official installer when missing; do not accept its terms silently.
!macro customInstall
  SetRegView 64
  ReadRegDWORD $0 HKLM "SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64" "Installed"
  ${If} $0 != 1
    ExecWait '"$INSTDIR\prerequisites\VC_redist.x64.exe" /install /norestart' $0
    ${If} $0 != 0
    ${AndIf} $0 != 3010
      MessageBox MB_OK "Microsoft Visual C++ runtime installation was not completed. Install prerequisites\VC_redist.x64.exe before opening the application."
    ${EndIf}
  ${EndIf}
!macroend

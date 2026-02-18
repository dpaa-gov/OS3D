; OS3D Inno Setup Installer Script
; Build: iscc build\installer.iss  (from project root)
; Requires: Inno Setup 6+ (https://jrsoftware.org/isinfo.php)
;
; Input:  dist\OS3D-compiled\  (PackageCompiler create_app output + runtime assets)
; Output: dist\OS3D-v0.1.0-windows-setup.exe

#define MyAppName "OS3D"
#define MyAppVersion "0.1.0"
#define MyAppPublisher "Defense POW/MIA Accounting Agency"
#define MyAppURL "https://github.com/dpaa-gov/OS3D"
#define MyAppExeName "os3d.exe"

[Setup]
AppId={{B4E8C3F2-AD50-5F9B-C6E7-2G3B4D5E6F70}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
OutputDir=..\dist
OutputBaseFilename=OS3D-v{#MyAppVersion}-windows-setup
SetupIconFile=os3d.ico
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
; Bundle the entire compiled app directory
Source: "..\dist\OS3D-compiled\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

; Runtime assets
Source: "..\public\*"; DestDir: "{app}\public"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\views\*"; DestDir: "{app}\views"; Flags: ignoreversion recursesubdirs createallsubdirs

; Manifest.toml for Genie package resolution
Source: "..\Manifest.toml"; DestDir: "{app}\share\julia"; Flags: ignoreversion

; VBS launcher (no console window) and icon
Source: "OS3D.vbs"; DestDir: "{app}"; Flags: ignoreversion
Source: "os3d.ico"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
; Start Menu — VBS launcher with icon (no console)
Name: "{group}\{#MyAppName}"; Filename: "{app}\OS3D.vbs"; IconFilename: "{app}\os3d.ico"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"

; Desktop — VBS launcher with icon (no console)
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\OS3D.vbs"; IconFilename: "{app}\os3d.ico"; Tasks: desktopicon

[Run]
Filename: "{app}\OS3D.vbs"; Description: "{cm:LaunchProgram,{#MyAppName}}"; Flags: nowait postinstall skipifsilent shellexec

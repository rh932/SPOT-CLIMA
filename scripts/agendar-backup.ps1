# Registra (ou atualiza) a tarefa diária do Windows que roda `npm run db:backup`.
#
# Uso, no PowerShell, na pasta do projeto:
#   powershell -ExecutionPolicy Bypass -File scripts\agendar-backup.ps1            # todo dia às 12:30
#   powershell -ExecutionPolicy Bypass -File scripts\agendar-backup.ps1 -Hora 18:00
#
# - Roda com o usuário logado, sem pedir senha e sem privilégio de administrador.
# - "Executar assim que possível": se o computador estiver desligado no horário,
#   o backup roda quando ele voltar a ligar.
# - O log fica ao lado dos backups (backup.log), sem senha nem dado de funcionário:
#   só a contagem de linhas por tabela e o nome do arquivo gerado.
# - Para remover: Unregister-ScheduledTask -TaskName "SPOT CLIMA - backup diario"
param(
  [string]$Hora = '12:30'
)

$ErrorActionPreference = 'Stop'
$projeto = Split-Path -Parent $PSScriptRoot
$node = (Get-Command node).Source
$pastaBackups = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'spot-clima-backups'
New-Item -ItemType Directory -Force -Path $pastaBackups | Out-Null
$log = Join-Path $pastaBackups 'backup.log'

# cmd /c para registrar data e saída no log; o script em si não imprime segredo.
$comando = "/c echo ==== %date% %time% >> `"$log`" && `"$node`" scripts\backup-db.mjs >> `"$log`" 2>&1"
$acao = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument $comando -WorkingDirectory $projeto
$gatilho = New-ScheduledTaskTrigger -Daily -At $Hora
$config = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 30)

Register-ScheduledTask -TaskName 'SPOT CLIMA - backup diario' -Action $acao -Trigger $gatilho -Settings $config `
  -Description 'Backup cifrado do banco do SPOT CLIMA (scripts/backup-db.mjs). Mantém os 30 mais recentes.' -Force | Out-Null

Write-Output "Tarefa 'SPOT CLIMA - backup diario' registrada para $Hora. Backups e log em $pastaBackups"

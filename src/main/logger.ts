import log from 'electron-log/main'

log.initialize()
log.transports.console.level = 'debug'
log.transports.file.level = 'info'

Object.assign(console, log.functions)

export function getLogPath(): string {
    return log.transports.file.getFile().path
}

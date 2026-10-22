/**
 * Platform aware helpers used to install vcpkg.
 *
 * Everything in this module is pure: it never touches the file system or the
 * network, which keeps the platform specific behaviour easy to unit test.
 */
import * as path from 'node:path'

/** Default repository that is cloned when the `repository` input is empty. */
export const DEFAULT_REPOSITORY = 'https://github.com/microsoft/vcpkg'

/** Default ref (branch, tag or commit) that is checked out. */
export const DEFAULT_REF = 'master'

/** Default installation directory on Windows runners. */
export const WINDOWS_INSTALL_DIR = 'C:\\vcpkg'

/** Default installation directory on Linux and macOS runners. */
export const UNIX_INSTALL_DIR = '/usr/local/share/vcpkg'

/** Runners this action knows how to install vcpkg on. */
export const SUPPORTED_PLATFORMS = ['win32', 'darwin', 'linux']

/** A command and its arguments, ready to be handed to `@actions/exec`. */
export interface CommandSpec {
  command: string
  args: string[]
}

/** Returns true when the given platform is a Windows platform. */
export function isWindows(platform: string = process.platform): boolean {
  return platform === 'win32'
}

/** Returns true when the action supports the given platform. */
export function isSupportedPlatform(
  platform: string = process.platform
): boolean {
  return SUPPORTED_PLATFORMS.includes(platform)
}

/**
 * Returns the default installation directory for the given platform.
 *
 * Windows uses `C:\vcpkg`, everything else uses `/usr/local/share/vcpkg`.
 */
export function defaultInstallDir(platform: string = process.platform): string {
  return isWindows(platform) ? WINDOWS_INSTALL_DIR : UNIX_INSTALL_DIR
}

/**
 * Joins path segments with the separators of the target platform rather than
 * the host OS, so Windows paths stay readable when they are built on Linux.
 */
function joinPath(platform: string, ...segments: string[]): string {
  const join = isWindows(platform) ? path.win32.join : path.posix.join
  return join(...segments)
}

/** Absolute path of the `vcpkg` executable inside the installation directory. */
export function vcpkgExecutable(
  installDir: string,
  platform: string = process.platform
): string {
  return joinPath(
    platform,
    installDir,
    isWindows(platform) ? 'vcpkg.exe' : 'vcpkg'
  )
}

/**
 * Arguments for the initial `git clone`.
 *
 * `--branch` accepts branches and tags, but not commit hashes. Callers retry
 * with a full clone when this command fails.
 */
export function cloneArgs(
  repository: string,
  ref: string,
  installDir: string
): string[] {
  return ['clone', '--branch', ref, '--single-branch', repository, installDir]
}

/**
 * Command that bootstraps the `vcpkg` executable.
 *
 * Windows runs `bootstrap-vcpkg.bat` through PowerShell (pwsh when available),
 * every other platform runs `bootstrap-vcpkg.sh` through bash.
 */
export function bootstrapCommand(
  installDir: string,
  platform: string = process.platform,
  powershell = 'pwsh'
): CommandSpec {
  if (isWindows(platform)) {
    const script = joinPath(platform, installDir, 'bootstrap-vcpkg.bat')
    return {
      command: powershell,
      args: [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        `& '${script.replace(/'/g, "''")}'`
      ]
    }
  }

  return {
    command: 'bash',
    args: [joinPath(platform, installDir, 'bootstrap-vcpkg.sh')]
  }
}

/** Command that registers the machine wide vcpkg integration. */
export function integrateCommand(
  installDir: string,
  platform: string = process.platform
): CommandSpec {
  return {
    command: vcpkgExecutable(installDir, platform),
    args: ['integrate', 'install']
  }
}

/** Command that prints the version of the installed vcpkg. */
export function versionCommand(
  installDir: string,
  platform: string = process.platform
): CommandSpec {
  return {
    command: vcpkgExecutable(installDir, platform),
    args: ['version']
  }
}

/**
 * Quotes a command so that `@actions/exec` does not split it on whitespace.
 *
 * `exec()` tokenizes its first argument, so a tool path such as
 * `C:\Program Files\Git\cmd\git.exe` would otherwise be cut in half.
 */
export function quoteCommand(command: string): string {
  return /\s/u.test(command) ? `"${command}"` : command
}

/**
 * Extracts the version from `vcpkg version` output.
 *
 * The first line looks like
 * `vcpkg package management program version 2024.09.30`.
 */
export function parseVersion(output: string): string {
  const match = output.match(/version\s+(\S+)/i)
  if (match) return match[1]

  return output.trim().split(/\r?\n/)[0] ?? ''
}

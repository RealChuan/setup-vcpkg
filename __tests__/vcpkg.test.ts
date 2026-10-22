/**
 * Unit tests for the platform helpers in src/vcpkg.ts
 */
import {
  DEFAULT_REF,
  DEFAULT_REPOSITORY,
  UNIX_INSTALL_DIR,
  WINDOWS_INSTALL_DIR,
  bootstrapCommand,
  cloneArgs,
  defaultInstallDir,
  integrateCommand,
  isSupportedPlatform,
  isWindows,
  parseVersion,
  quoteCommand,
  versionCommand,
  vcpkgExecutable
} from '../src/vcpkg.js'

describe('vcpkg.ts', () => {
  it('knows which platforms are supported', () => {
    expect(isSupportedPlatform('win32')).toBe(true)
    expect(isSupportedPlatform('linux')).toBe(true)
    expect(isSupportedPlatform('darwin')).toBe(true)
    expect(isSupportedPlatform('freebsd')).toBe(false)
  })

  it('detects Windows', () => {
    expect(isWindows('win32')).toBe(true)
    expect(isWindows('linux')).toBe(false)
    expect(isWindows('darwin')).toBe(false)
  })

  it('uses a platform specific installation directory', () => {
    expect(defaultInstallDir('win32')).toBe(WINDOWS_INSTALL_DIR)
    expect(defaultInstallDir('win32')).toBe('C:\\vcpkg')
    expect(defaultInstallDir('linux')).toBe(UNIX_INSTALL_DIR)
    expect(defaultInstallDir('darwin')).toBe('/usr/local/share/vcpkg')
  })

  it('resolves the vcpkg executable', () => {
    expect(vcpkgExecutable('C:\\vcpkg', 'win32')).toBe('C:\\vcpkg\\vcpkg.exe')
    expect(vcpkgExecutable('/usr/local/share/vcpkg', 'linux')).toBe(
      '/usr/local/share/vcpkg/vcpkg'
    )
  })

  it('builds the clone arguments', () => {
    expect(cloneArgs(DEFAULT_REPOSITORY, DEFAULT_REF, 'C:\\vcpkg')).toEqual([
      'clone',
      '--branch',
      'master',
      '--single-branch',
      'https://github.com/microsoft/vcpkg',
      'C:\\vcpkg'
    ])
  })

  it('bootstraps with PowerShell on Windows', () => {
    const spec = bootstrapCommand('C:\\vcpkg', 'win32')

    expect(spec.command).toBe('pwsh')
    expect(spec.args).toContainEqual(`& 'C:\\vcpkg\\bootstrap-vcpkg.bat'`)
  })

  it('allows a different PowerShell executable', () => {
    const spec = bootstrapCommand('C:\\vcpkg', 'win32', 'powershell')

    expect(spec.command).toBe('powershell')
  })

  it('bootstraps with bash on Linux and macOS', () => {
    expect(bootstrapCommand('/usr/local/share/vcpkg', 'linux')).toEqual({
      command: 'bash',
      args: ['/usr/local/share/vcpkg/bootstrap-vcpkg.sh']
    })
    expect(bootstrapCommand('/usr/local/share/vcpkg', 'darwin')).toEqual({
      command: 'bash',
      args: ['/usr/local/share/vcpkg/bootstrap-vcpkg.sh']
    })
  })

  it('integrates the installation', () => {
    expect(integrateCommand('/usr/local/share/vcpkg', 'linux')).toEqual({
      command: '/usr/local/share/vcpkg/vcpkg',
      args: ['integrate', 'install']
    })
  })

  it('reads the version', () => {
    expect(versionCommand('C:\\vcpkg', 'win32')).toEqual({
      command: 'C:\\vcpkg\\vcpkg.exe',
      args: ['version']
    })
  })

  it('quotes commands that contain whitespace', () => {
    expect(quoteCommand('git')).toBe('git')
    expect(quoteCommand('/usr/local/share/vcpkg/vcpkg')).toBe(
      '/usr/local/share/vcpkg/vcpkg'
    )
    expect(quoteCommand('C:\\Program Files\\Git\\cmd\\git.exe')).toBe(
      '"C:\\Program Files\\Git\\cmd\\git.exe"'
    )
  })

  it('parses the version output', () => {
    expect(
      parseVersion(
        'vcpkg package management program version 2024.09.30\n\nSee LICENSE.txt for license information.\n'
      )
    ).toBe('2024.09.30')

    expect(parseVersion('\nvcpkg version 2023.01.09\n')).toBe('2023.01.09')
  })

  it('falls back to the first line when the output is unexpected', () => {
    expect(parseVersion('something completely different\nsecond line\n')).toBe(
      'something completely different'
    )
    expect(parseVersion('')).toBe('')
  })
})

/**
 * Unit tests for the installation flow in src/install.ts
 *
 * The file system is real (a temporary directory is used) while
 * `@actions/core` and `@actions/exec` are mocked, so no command is executed.
 */
import { jest } from '@jest/globals'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as core from '../__fixtures__/core.js'
import * as exec from '../__fixtures__/exec.js'

jest.unstable_mockModule('@actions/core', () => core)
jest.unstable_mockModule('@actions/exec', () => exec)

const { install } = await import('../src/install.js')

/** Command arguments passed to `exec.exec`, in call order. */
function execArgs(name: string): string[][] {
  return exec.exec.mock.calls
    .map(([, args]) => args ?? [])
    .filter((args) => args[0] === name)
}

describe('install.ts', () => {
  let workspace: string
  let installDir: string

  beforeEach(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'setup-vcpkg-'))
    installDir = path.join(workspace, 'vcpkg')

    exec.exec.mockResolvedValue(0)
    exec.getExecOutput.mockResolvedValue({
      exitCode: 0,
      stdout: 'vcpkg package management program version 2024.09.30\n',
      stderr: ''
    })
  })

  afterEach(() => {
    jest.resetAllMocks()
    fs.rmSync(workspace, { recursive: true, force: true })
  })

  it('clones the repository and bootstraps vcpkg', async () => {
    const result = await install({
      repository: 'https://github.com/microsoft/vcpkg',
      ref: 'master',
      installDir,
      platform: 'linux'
    })

    expect(result).toEqual({ installDir, version: '2024.09.30' })

    expect(exec.exec).toHaveBeenCalledWith(expect.stringMatching(/git/u), [
      'clone',
      '--branch',
      'master',
      '--single-branch',
      'https://github.com/microsoft/vcpkg',
      installDir
    ])
    expect(exec.exec).toHaveBeenCalledWith(
      'bash',
      [expect.stringMatching(/bootstrap-vcpkg\.sh$/u)],
      expect.anything()
    )
    expect(exec.exec).toHaveBeenCalledWith(
      expect.stringMatching(/vcpkg$/u),
      ['integrate', 'install'],
      expect.anything()
    )
    expect(exec.getExecOutput).toHaveBeenCalledWith(
      expect.stringMatching(/vcpkg$/u),
      ['version'],
      expect.anything()
    )
  })

  it('skips the integration when it is disabled', async () => {
    await install({
      repository: 'https://github.com/microsoft/vcpkg',
      ref: 'master',
      installDir,
      platform: 'linux',
      runIntegrate: false
    })

    expect(execArgs('integrate')).toHaveLength(0)
    expect(exec.exec).toHaveBeenCalledTimes(2)
  })

  it('falls back to a full clone when the ref is not a branch', async () => {
    exec.exec.mockRejectedValueOnce(new Error('Remote branch v1.0.0 not found'))

    await install({
      repository: 'https://github.com/microsoft/vcpkg',
      ref: 'v1.0.0',
      installDir,
      platform: 'linux'
    })

    expect(execArgs('clone')).toEqual([
      [
        'clone',
        '--branch',
        'v1.0.0',
        '--single-branch',
        'https://github.com/microsoft/vcpkg',
        installDir
      ],
      ['clone', 'https://github.com/microsoft/vcpkg', installDir]
    ])
    expect(exec.exec).toHaveBeenCalledWith(expect.stringMatching(/git/u), [
      '-C',
      installDir,
      'checkout',
      '--force',
      'v1.0.0'
    ])
  })

  it('reuses an existing installation when clean is false', async () => {
    fs.mkdirSync(installDir, { recursive: true })
    fs.writeFileSync(path.join(installDir, 'bootstrap-vcpkg.sh'), '')

    await install({
      repository: 'https://github.com/microsoft/vcpkg',
      ref: 'master',
      installDir,
      platform: 'linux',
      clean: false
    })

    expect(execArgs('clone')).toHaveLength(0)
    expect(fs.existsSync(installDir)).toBe(true)
  })

  it('removes an existing installation when clean is true', async () => {
    fs.mkdirSync(installDir, { recursive: true })
    fs.writeFileSync(path.join(installDir, 'stale.txt'), 'stale')

    await install({
      repository: 'https://github.com/microsoft/vcpkg',
      ref: 'master',
      installDir,
      platform: 'linux',
      clean: true
    })

    expect(execArgs('clone')).toHaveLength(1)
    expect(fs.existsSync(path.join(installDir, 'stale.txt'))).toBe(false)
  })

  it('rejects unsupported platforms', async () => {
    await expect(
      install({
        repository: 'https://github.com/microsoft/vcpkg',
        ref: 'master',
        installDir,
        platform: 'freebsd'
      })
    ).rejects.toThrow(/cannot be installed/u)
  })
})

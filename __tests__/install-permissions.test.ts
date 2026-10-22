/**
 * Unit tests for the elevated rights fallbacks in src/install.ts
 *
 * Runner images ship a root owned vcpkg at the default location, so removing
 * it fails for the runner user. `@actions/io` is mocked here to reproduce that
 * failure on every platform, while `sudo` calls are captured instead of being
 * executed.
 */
import { jest } from '@jest/globals'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as core from '../__fixtures__/core.js'
import * as exec from '../__fixtures__/exec.js'
import * as io from '../__fixtures__/io.js'

jest.unstable_mockModule('@actions/core', () => core)
jest.unstable_mockModule('@actions/exec', () => exec)
jest.unstable_mockModule('@actions/io', () => io)

const { install } = await import('../src/install.js')

describe('install.ts without write access', () => {
  let workspace: string
  let installDir: string
  let commands: Array<[string, string[]]>

  beforeEach(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'setup-vcpkg-owned-'))
    installDir = path.join(workspace, 'vcpkg')
    fs.mkdirSync(installDir)

    commands = []
    io.which.mockImplementation((tool) =>
      Promise.resolve(tool === 'git' ? '/usr/bin/git' : '')
    )
    io.rmRF.mockRejectedValue(
      new Error(
        'File was unable to be removed Error: EACCES: permission denied'
      )
    )
    exec.exec.mockImplementation((command, args) => {
      commands.push([command, args ?? []])
      if (command === 'sudo' && args?.[0] === 'rm') {
        fs.rmSync(installDir, { recursive: true, force: true })
      }
      return Promise.resolve(0)
    })
    exec.getExecOutput.mockResolvedValue({
      exitCode: 0,
      stdout: 'vcpkg package management program version 2024.09.30\n',
      stderr: ''
    })
  })

  afterEach(() => {
    jest.resetAllMocks()
    if (fs.existsSync(installDir)) fs.chmodSync(installDir, 0o755)
    fs.rmSync(workspace, { recursive: true, force: true })
  })

  it('removes an installation owned by another user with sudo', async () => {
    const result = await install({
      repository: 'https://github.com/microsoft/vcpkg',
      ref: 'master',
      installDir,
      platform: 'linux'
    })

    expect(commands).toContainEqual(['sudo', ['rm', '-rf', installDir]])
    expect(result).toEqual({ installDir, version: '2024.09.30' })
  })

  it('takes ownership of an existing installation that is reused', async () => {
    // POSIX ownership cannot be reproduced on Windows, where `chmod` does not
    // make a directory read only.
    if (process.platform === 'win32') return

    fs.chmodSync(installDir, 0o555)

    await install({
      repository: 'https://github.com/microsoft/vcpkg',
      ref: 'master',
      installDir,
      platform: 'linux',
      clean: false
    })

    expect(commands).toContainEqual([
      'sudo',
      ['chown', '-R', `${process.getuid?.()}:${process.getgid?.()}`, installDir]
    ])
  })

  it('never uses sudo on Windows', async () => {
    await expect(
      install({
        repository: 'https://github.com/microsoft/vcpkg',
        ref: 'master',
        installDir,
        platform: 'win32'
      })
    ).rejects.toThrow(/EACCES/u)

    expect(commands.some(([command]) => command === 'sudo')).toBe(false)
  })
})

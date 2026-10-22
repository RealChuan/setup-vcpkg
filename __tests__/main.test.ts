/**
 * Unit tests for the action's main functionality, src/main.ts
 *
 * The `@actions/core` module and the install module are replaced with mocks so
 * that the tests only verify how inputs are turned into outputs and how errors
 * are reported.
 */
import { jest } from '@jest/globals'
import * as core from '../__fixtures__/core.js'
import { install } from '../__fixtures__/install.js'

// Mocks should be declared before the module being tested is imported.
jest.unstable_mockModule('@actions/core', () => core)
jest.unstable_mockModule('../src/install.js', () => ({ install }))

// The module being tested should be imported dynamically. This ensures that the
// mocks are used in place of any actual dependencies.
const { run } = await import('../src/main.js')

describe('main.ts', () => {
  const inputs: Record<string, string> = {}

  beforeEach(() => {
    inputs.repository = ''
    inputs.ref = ''
    inputs['install-dir'] = ''

    core.getInput.mockImplementation((name) => inputs[name] ?? '')
    core.getBooleanInput.mockImplementation((name) => name !== 'disabled')
    install.mockResolvedValue({
      installDir: 'C:\\vcpkg',
      version: '2024.09.30'
    })
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  it('installs vcpkg with the default inputs', async () => {
    await run()

    expect(install).toHaveBeenCalledWith({
      repository: 'https://github.com/microsoft/vcpkg',
      ref: 'master',
      installDir: '',
      clean: true,
      runIntegrate: true
    })
  })

  it('passes the configured inputs through', async () => {
    inputs.repository = 'https://github.com/example/vcpkg'
    inputs.ref = 'v1.2.3'
    inputs['install-dir'] = '/opt/vcpkg'
    core.getBooleanInput.mockReturnValue(false)

    await run()

    expect(install).toHaveBeenCalledWith({
      repository: 'https://github.com/example/vcpkg',
      ref: 'v1.2.3',
      installDir: '/opt/vcpkg',
      clean: false,
      runIntegrate: false
    })
  })

  it('exports the installation for the following steps', async () => {
    await run()

    expect(core.addPath).toHaveBeenCalledWith('C:\\vcpkg')
    expect(core.exportVariable).toHaveBeenCalledWith('VCPKG_ROOT', 'C:\\vcpkg')
    expect(core.exportVariable).toHaveBeenCalledWith(
      'VCPKG_INSTALLATION_ROOT',
      'C:\\vcpkg'
    )
    expect(core.setOutput).toHaveBeenCalledWith('vcpkg-root', 'C:\\vcpkg')
    expect(core.setOutput).toHaveBeenCalledWith('vcpkg-version', '2024.09.30')
    expect(core.setFailed).not.toHaveBeenCalled()
  })

  it('sets a failed status when the installation fails', async () => {
    install.mockRejectedValue(new Error('git is not available'))

    await run()

    expect(core.setFailed).toHaveBeenCalledWith('git is not available')
    expect(core.setOutput).not.toHaveBeenCalled()
  })

  it('sets a failed status for non error rejections', async () => {
    install.mockRejectedValue('boom')

    await run()

    expect(core.setFailed).toHaveBeenCalledWith('boom')
  })
})

import * as core from '@actions/core'
import { install } from './install.js'
import {
  DEFAULT_REF,
  DEFAULT_REPOSITORY,
  isSupportedPlatform
} from './vcpkg.js'

/**
 * The main function for the action.
 *
 * @returns Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  try {
    if (!isSupportedPlatform()) {
      throw new Error(
        `vcpkg cannot be installed on the "${process.platform}" platform. Supported platforms are Windows, Linux and macOS.`
      )
    }

    const result = await install({
      repository: core.getInput('repository') || DEFAULT_REPOSITORY,
      ref: core.getInput('ref') || DEFAULT_REF,
      installDir: core.getInput('install-dir'),
      clean: core.getBooleanInput('clean'),
      runIntegrate: core.getBooleanInput('run-integrate')
    })

    // Make the installation discoverable by the following steps.
    core.addPath(result.installDir)
    core.exportVariable('VCPKG_ROOT', result.installDir)
    core.exportVariable('VCPKG_INSTALLATION_ROOT', result.installDir)

    core.setOutput('vcpkg-root', result.installDir)
    core.setOutput('vcpkg-version', result.version)

    core.info(`vcpkg ${result.version} is ready at ${result.installDir}`)
  } catch (error) {
    // Fail the workflow run if an error occurs
    if (error instanceof Error) core.setFailed(error.message)
    else core.setFailed(String(error))
  }
}

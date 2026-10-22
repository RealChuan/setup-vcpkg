/**
 * Installs vcpkg on the current runner.
 *
 * The installation is deliberately minimal: the repository is cloned, the
 * `vcpkg` executable is bootstrapped and (optionally) the machine wide
 * integration is registered. No ports are installed.
 */
import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as io from '@actions/io'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  bootstrapCommand,
  cloneArgs,
  defaultInstallDir,
  integrateCommand,
  isSupportedPlatform,
  isWindows,
  parseVersion,
  quoteCommand,
  versionCommand
} from './vcpkg.js'
import type { CommandSpec } from './vcpkg.js'

/** Options accepted by {@link install}. */
export interface InstallOptions {
  /** Repository to clone. */
  repository: string
  /** Branch, tag or commit to check out. */
  ref: string
  /** Target directory. Defaults to the platform specific directory. */
  installDir?: string
  /** Remove an existing installation before cloning. */
  clean?: boolean
  /** Run `vcpkg integrate install` after bootstrapping. */
  runIntegrate?: boolean
  /** Platform to install for. Defaults to `process.platform`. */
  platform?: string
}

/** Result of a successful installation. */
export interface InstallResult {
  /** Directory vcpkg was installed into. */
  installDir: string
  /** Version reported by `vcpkg version`. */
  version: string
}

/**
 * Installs vcpkg and returns where it lives and which version was installed.
 */
export async function install(options: InstallOptions): Promise<InstallResult> {
  const platform = options.platform ?? process.platform
  if (!isSupportedPlatform(platform)) {
    throw new Error(
      `vcpkg cannot be installed on the "${platform}" platform. Supported platforms are Windows, Linux and macOS.`
    )
  }

  const installDir = options.installDir || defaultInstallDir(platform)
  const git = await io.which('git', false)
  if (!git) {
    throw new Error(
      'git is required to install vcpkg but was not found on PATH'
    )
  }

  await removeExisting(installDir, platform, options.clean ?? true)
  await prepareInstallDir(installDir, platform)
  await cloneRepository(git, options.repository, options.ref, installDir)

  const powershell = await resolvePowerShell(platform)
  await run(bootstrapCommand(installDir, platform, powershell), installDir)

  if (options.runIntegrate ?? true) {
    await run(integrateCommand(installDir, platform), installDir)
  } else {
    core.info('Skipping "vcpkg integrate install"')
  }

  const version = await readVersion(installDir, platform)
  return { installDir, version }
}

/** Removes a previous installation unless it should be reused. */
async function removeExisting(
  installDir: string,
  platform: string,
  clean: boolean
): Promise<void> {
  if (!fs.existsSync(installDir)) return

  if (!clean) {
    core.info(`Reusing the existing vcpkg installation at ${installDir}`)
    return
  }

  core.info(`Removing the existing vcpkg installation at ${installDir}`)
  try {
    await io.rmRF(installDir)
  } catch (error) {
    if (isWindows(platform)) throw error

    // Runner images ship a root owned vcpkg at the default location, so
    // removing it needs elevated rights. Everything after this point runs as
    // the runner user again.
    core.info(`${installDir} is not owned by the runner user, using sudo`)
    await exec.exec('sudo', ['rm', '-rf', installDir])
  }

  if (fs.existsSync(installDir)) {
    throw new Error(
      `Failed to remove the existing vcpkg installation at ${installDir}. Check the file permissions or set "clean" to false.`
    )
  }
}

/**
 * Makes sure the installation directory can be written to.
 *
 * On Linux `/usr/local/share` is owned by root, so a passwordless `sudo` is
 * used to create the directory and hand it back to the current user. The rest
 * of the installation therefore runs as the runner user, which keeps
 * `vcpkg integrate install` writing to the right home directory.
 */
async function prepareInstallDir(
  installDir: string,
  platform: string
): Promise<void> {
  if (isWindows(platform)) return

  if (fs.existsSync(installDir)) {
    if (await isWritable(installDir)) return
    await takeOwnership(installDir)
    return
  }

  const parent = path.posix.dirname(installDir)
  if (!fs.existsSync(parent)) {
    await fs.promises.mkdir(parent, { recursive: true }).catch(() => undefined)
  }

  if (fs.existsSync(parent) && (await isWritable(parent))) return

  core.info(`Creating ${installDir} with sudo`)
  await exec.exec('sudo', ['mkdir', '-p', installDir])
  await takeOwnership(installDir)
}

/** Hands an existing directory over to the user running the action. */
async function takeOwnership(directory: string): Promise<void> {
  const uid = process.getuid?.()
  const gid = process.getgid?.()
  if (uid === undefined || gid === undefined) return

  core.info(`Taking ownership of ${directory} with sudo`)
  await exec.exec('sudo', ['chown', '-R', `${uid}:${gid}`, directory])
}

/** Returns true when the current process may write to `directory`. */
async function isWritable(directory: string): Promise<boolean> {
  try {
    await fs.promises.access(directory, fs.constants.W_OK)
    return true
  } catch {
    return false
  }
}

/** Clones the requested ref, falling back to a full clone for commit hashes. */
async function cloneRepository(
  git: string,
  repository: string,
  ref: string,
  installDir: string
): Promise<void> {
  if (hasContent(installDir)) {
    core.info(`${installDir} is not empty, skipping "git clone"`)
    return
  }

  core.info(`Cloning ${repository} (${ref}) into ${installDir}`)
  try {
    await exec.exec(quoteCommand(git), cloneArgs(repository, ref, installDir))
  } catch {
    core.info(
      `Unable to clone "${ref}" directly, retrying with a full clone before checking it out`
    )
    await io.rmRF(installDir)
    await exec.exec(quoteCommand(git), ['clone', repository, installDir])
    await exec.exec(quoteCommand(git), [
      '-C',
      installDir,
      'checkout',
      '--force',
      ref
    ])
  }
}

/** Returns true when `directory` exists and contains at least one entry. */
function hasContent(directory: string): boolean {
  try {
    return fs.readdirSync(directory).length > 0
  } catch {
    return false
  }
}

/**
 * Resolves the PowerShell executable used to run `bootstrap-vcpkg.bat`.
 *
 * `pwsh` (PowerShell 7+) is preferred, with `powershell` (Windows PowerShell)
 * as fallback for self-hosted runners that only ship the built-in edition.
 */
async function resolvePowerShell(platform: string): Promise<string> {
  if (!isWindows(platform)) return 'pwsh'

  for (const candidate of ['pwsh', 'powershell']) {
    const found = await io.which(candidate, false)
    if (found) return candidate
  }

  return 'powershell'
}

/** Runs a command inside the installation directory. */
async function run(spec: CommandSpec, cwd: string): Promise<void> {
  core.info(`Running: ${spec.command} ${spec.args.join(' ')}`)
  await exec.exec(quoteCommand(spec.command), spec.args, {
    cwd,
    env: withMetricsDisabled()
  })
}

/** Reads the version of the freshly installed vcpkg. */
async function readVersion(
  installDir: string,
  platform: string
): Promise<string> {
  const spec = versionCommand(installDir, platform)
  const { stdout } = await exec.getExecOutput(
    quoteCommand(spec.command),
    spec.args,
    {
      cwd: installDir,
      env: withMetricsDisabled(),
      silent: true
    }
  )

  return parseVersion(stdout)
}

/** Copy of the current environment with vcpkg telemetry disabled. */
function withMetricsDisabled(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) env[key] = value
  }

  env.VCPKG_DISABLE_METRICS = '1'
  return env
}

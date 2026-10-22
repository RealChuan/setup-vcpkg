import { jest } from '@jest/globals'

export const rmRF = jest.fn<(inputPath: string) => Promise<void>>()
export const which =
  jest.fn<(tool: string, check?: boolean) => Promise<string>>()

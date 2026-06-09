/* global describe, it */

import { deepStrictEqual } from 'assert'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const browserEntry = path.resolve(__dirname, '../browser.js')

describe('browser entry', function () {
  it('does not throw when envPrefix is provided in a Node smoke environment', async function () {
    const { default: parser } = await import(pathToFileURL(browserEntry).href)
    const argv = parser('--x 1', {
      envPrefix: 'APP_'
    })

    deepStrictEqual(argv, {
      _: [],
      x: 1
    })
  })
})

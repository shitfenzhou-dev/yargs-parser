/* global describe, it */

import { strictEqual, deepStrictEqual, doesNotThrow } from 'assert'

describe('browser entry smoke test', function () {
  it('parser("--x 1", { envPrefix: "APP_" }) does not throw', async function () {
    const { default: parser } = await import('../browser.js')
    doesNotThrow(() => {
      parser('--x 1', { envPrefix: 'APP_' })
    })
  })

  it('parser("--x 1", { envPrefix: "APP_" }) returns correct result', async function () {
    const { default: parser } = await import('../browser.js')
    const result = parser('--x 1', { envPrefix: 'APP_' })
    strictEqual(result.x, 1)
    deepStrictEqual(result._, [])
  })

  it('parser("", { envPrefix: "APP_" }) returns only _ array, no env fields', async function () {
    const { default: parser } = await import('../browser.js')
    const result = parser('', { envPrefix: 'APP_' })
    deepStrictEqual(result, { _: [] })
  })

  it('browser.detailed works with envPrefix', async function () {
    const { default: parser } = await import('../browser.js')
    const result = parser.detailed('--hello world', { envPrefix: 'APP_' })
    deepStrictEqual(result.argv, { _: [], hello: 'world' })
  })
})
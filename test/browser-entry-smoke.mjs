import { strict as assert } from 'assert'
import parser from '../browser.js'

describe('browser entry smoke test', function () {
  it('should not throw when using envPrefix', function () {
    const result = parser('--x 1', { envPrefix: 'APP_' })
    assert.strictEqual(result.x, 1)
    assert.deepStrictEqual(result._, [])
  })

  it('should return empty env vars (no phantom env keys)', function () {
    const result = parser('', { envPrefix: 'APP_' })
    assert.deepStrictEqual(result, { _: [] })
  })

  it('should prioritize CLI values over defaults with empty browser env', function () {
    const result = parser('--app-value cli', {
      envPrefix: 'APP_',
      default: { appValue: 'default' }
    })
    assert.strictEqual(result.appValue, 'cli')
  })
})

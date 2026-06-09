/* global describe, it */

import yargsParser from '../../lib/index.js'
import * as assert from 'assert'

describe('types', () => {
  it('allows a partial options object to be provided', () => {
    const argv = yargsParser('--foo 99', {
      string: 'foo'
    })
    assert.strictEqual(argv.foo, '99')
  })

  it('allows integer option to be provided as string[]', () => {
    const argv = yargsParser(['--port', '3000'], {
      integer: ['port']
    })
    assert.strictEqual(argv.port, 3000)
  })

  it('allows integer option to be provided as single string', () => {
    const argv = yargsParser(['--port', '3000'], {
      integer: 'port'
    })
    assert.strictEqual(argv.port, 3000)
  })

  it('allows array option with integer: true to be provided', () => {
    const argv = yargsParser(['--ids', '1', '2'], {
      array: [{ key: 'ids', integer: true }]
    })
    assert.deepStrictEqual(argv.ids, [1, 2])
  })
})

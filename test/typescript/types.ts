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

  it('opts.integer and array: [{ key, integer: true }] types', () => {
    const argv = yargsParser('--port 3000', {
      integer: 'port'
    })
    assert.strictEqual(argv.port, 3000)

    const argvArray = yargsParser('--ids 1 2', {
      array: [{ key: 'ids', integer: true }]
    })
    assert.deepStrictEqual(argvArray.ids, [1, 2])
  })
})

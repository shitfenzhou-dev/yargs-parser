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

  it('allows integer options and integer array options to be provided', () => {
    const argv = yargsParser('--port 3000 --ids 1 --ids 2', {
      integer: ['port'],
      array: [{ key: 'ids', integer: true }]
    })

    assert.strictEqual(argv.port, 3000)
    assert.deepStrictEqual(argv.ids, [1, 2])
  })
})

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

  it('allows integer option as string', () => {
    const argv = yargsParser('--port 3000', {
      integer: 'port'
    })
    assert.strictEqual(argv.port, 3000)
  })

  it('allows integer option as string array', () => {
    const argv = yargsParser('--port 3000 --level 5', {
      integer: ['port', 'level']
    })
    assert.strictEqual(argv.port, 3000)
    assert.strictEqual(argv.level, 5)
  })

  it('allows array option with integer: true', () => {
    const argv = yargsParser('--ids 1 2 3', {
      array: [{ key: 'ids', integer: true }]
    })
    assert.deepStrictEqual(argv.ids, [1, 2, 3])
  })

  it('allows array option with integer: true combined with other options', () => {
    const argv = yargsParser('--nums 1 2', {
      array: [{ key: 'nums', integer: true }],
      integer: ['port'],
      default: { port: 8080 }
    })
    assert.deepStrictEqual(argv.nums, [1, 2])
    assert.strictEqual(argv.port, 8080)
  })
})

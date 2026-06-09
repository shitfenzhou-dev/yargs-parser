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
    const argv = yargsParser(['--port', '3000'], {
      integer: 'port'
    })
    assert.strictEqual(argv.port, 3000)
  })

  it('allows integer option as string[]', () => {
    const argv = yargsParser(['--port', '3000', '--count', '42'], {
      integer: ['port', 'count']
    })
    assert.strictEqual(argv.port, 3000)
    assert.strictEqual(argv.count, 42)
  })

  it('allows array with integer true', () => {
    const argv = yargsParser(['--ids', '1', '2'], {
      array: [{ key: 'ids', integer: true }]
    })
    assert.deepStrictEqual(argv.ids, [1, 2])
  })

  it('allows looksLikeInteger on parser', () => {
    assert.strictEqual(yargsParser.looksLikeInteger('42'), true)
    assert.strictEqual(yargsParser.looksLikeInteger('3.14'), false)
    assert.strictEqual(yargsParser.looksLikeInteger('0x10'), true)
  })
})

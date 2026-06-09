/* global describe, it */
/* eslint-disable prefer-arrow-callback */
import { strictEqual } from 'assert'
import { tokenizeArgString } from '../../lib/tokenize-arg-string.js'

describe('TokenizeArgString', function () {
  it('handles unquoted string', function () {
    const args = tokenizeArgString('--foo 99')
    strictEqual(args[0], '--foo')
    strictEqual(args[1], '99')
  })

  it('handles unquoted numbers', function () {
    const args = tokenizeArgString(['--foo', 9])
    strictEqual(args[0], '--foo')
    strictEqual(args[1], '9')
  })

  it('handles quoted string with no spaces', function () {
    const args = tokenizeArgString("--foo 'hello'")
    strictEqual(args[0], '--foo')
    strictEqual(args[1], "'hello'")
  })

  it('handles single quoted string with spaces', function () {
    const args = tokenizeArgString("--foo 'hello world' --bar='foo bar'")
    strictEqual(args[0], '--foo')
    strictEqual(args[1], "'hello world'")
    strictEqual(args[2], "--bar='foo bar'")
  })

  it('handles double quoted string with spaces', function () {
    const args = tokenizeArgString('--foo "hello world" --bar="foo bar"')
    strictEqual(args[0], '--foo')
    strictEqual(args[1], '"hello world"')
    strictEqual(args[2], '--bar="foo bar"')
  })

  it('handles single quoted empty string', function () {
    const args = tokenizeArgString('--foo \'\' --bar=\'\'')
    strictEqual(args[0], '--foo')
    strictEqual(args[1], "''")
    strictEqual(args[2], "--bar=''")
  })

  it('handles double quoted empty string', function () {
    const args = tokenizeArgString('--foo "" --bar=""')
    strictEqual(args[0], '--foo')
    strictEqual(args[1], '""')
    strictEqual(args[2], '--bar=""')
  })

  it('handles quoted string with embedded quotes', function () {
    const args = tokenizeArgString('--foo "hello \'world\'" --bar=\'foo "bar"\'')
    strictEqual(args[0], '--foo')
    strictEqual(args[1], '"hello \'world\'"')
    strictEqual(args[2], '--bar=\'foo "bar"\'')
  })

  // https://github.com/yargs/yargs-parser/pull/100
  // https://github.com/yargs/yargs-parser/pull/106
  it('ignores unneeded spaces', function () {
    const args = tokenizeArgString('  foo  bar  "foo  bar"  ')
    strictEqual(args[0], 'foo')
    strictEqual(args[1], 'bar')
    strictEqual(args[2], '"foo  bar"')
  })

  it('handles boolean options', function () {
    const args = tokenizeArgString('--foo -bar')
    strictEqual(args[0], '--foo')
    strictEqual(args[1], '-bar')
  })

  it('handles empty string', function () {
    const args = tokenizeArgString('')
    strictEqual(args.length, 0)
  })

  it('handles array with unquoted string', function () {
    const args = tokenizeArgString(['--foo', '99'])
    strictEqual(args[0], '--foo')
    strictEqual(args[1], '99')
  })

  it('handles array with quoted string with no spaces', function () {
    const args = tokenizeArgString(['--foo', "'hello'"])
    strictEqual(args[0], '--foo')
    strictEqual(args[1], "'hello'")
  })

  it('handles array with single quoted string with spaces', function () {
    const args = tokenizeArgString(['--foo', "'hello world'", "--bar='foo bar'"])
    strictEqual(args[0], '--foo')
    strictEqual(args[1], "'hello world'")
    strictEqual(args[2], "--bar='foo bar'")
  })

  it('handles array with double quoted string with spaces', function () {
    const args = tokenizeArgString(['--foo', '"hello world"', '--bar="foo bar"'])
    strictEqual(args[0], '--foo')
    strictEqual(args[1], '"hello world"')
    strictEqual(args[2], '--bar="foo bar"')
  })

  it('handles array with single quoted empty string', function () {
    const args = tokenizeArgString(['--foo', "''", "--bar=''"])
    strictEqual(args[0], '--foo')
    strictEqual(args[1], "''")
    strictEqual(args[2], "--bar=''")
  })

  it('handles array with double quoted empty string', function () {
    const args = tokenizeArgString(['--foo', '""', '--bar=""'])
    strictEqual(args[0], '--foo')
    strictEqual(args[1], '""')
    strictEqual(args[2], '--bar=""')
  })

  it('handles array with quoted string with embedded quotes', function () {
    const args = tokenizeArgString(['--foo', '"hello \'world\'"', '--bar=\'foo "bar"\''])
    strictEqual(args[0], '--foo')
    strictEqual(args[1], '"hello \'world\'"')
    strictEqual(args[2], '--bar=\'foo "bar"\'')
  })

  it('handles array with boolean options', function () {
    const args = tokenizeArgString(['--foo', '-bar'])
    strictEqual(args[0], '--foo')
    strictEqual(args[1], '-bar')
  })

  it('handles escaped double quote inside double quotes', function () {
    const args = tokenizeArgString('--msg "hello \\"world\\""')
    strictEqual(args[0], '--msg')
    strictEqual(args[1], '"hello "world""')
  })

  it('handles escaped single quote inside single quotes', function () {
    const args = tokenizeArgString("--msg 'it\\'s ok'")
    strictEqual(args[0], '--msg')
    strictEqual(args[1], "'it's ok'")
  })

  it('handles escaped backslash', function () {
    const args = tokenizeArgString('--path c:\\\\foo')
    strictEqual(args[0], '--path')
    strictEqual(args[1], 'c:\\foo')
  })

  it('handles escaped whitespace outside quotes', function () {
    const args = tokenizeArgString('--name hello\\ world')
    strictEqual(args[0], '--name')
    strictEqual(args[1], 'hello world')
  })

  it('handles multiple escaped whitespaces outside quotes', function () {
    const args = tokenizeArgString('--name hello\\ \\ world')
    strictEqual(args[0], '--name')
    strictEqual(args[1], 'hello  world')
  })

  it('handles escaped quote outside quotes', function () {
    const args = tokenizeArgString('--msg say\\"hello')
    strictEqual(args[0], '--msg')
    strictEqual(args[1], 'say"hello')
  })

  it('handles escaped backslash inside double quotes', function () {
    const args = tokenizeArgString('--path "c:\\\\foo"')
    strictEqual(args[0], '--path')
    strictEqual(args[1], '"c:\\foo"')
  })

  it('array input is not affected by escape handling', function () {
    const args = tokenizeArgString(['--msg', '"hello \\"world\\""'])
    strictEqual(args[0], '--msg')
    strictEqual(args[1], '"hello \\"world\\""')
  })
})

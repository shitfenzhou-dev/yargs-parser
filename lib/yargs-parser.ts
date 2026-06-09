/**
 * @license
 * Copyright (c) 2016, Contributors
 * SPDX-License-Identifier: ISC
 */
/* eslint-disable prefer-arrow-callback */

import { tokenizeArgString } from './tokenize-arg-string.js'
import type {
  ArgsInput,
  Arguments,
  ArrayFlagsKey,
  ArrayOption,
  CoerceCallback,
  Configuration,
  DefaultValuesForType,
  DetailedArguments,
  Dictionary,
  Flag,
  Flags,
  FlagsKey,
  StringFlag,
  BooleanFlag,
  NumberFlag,
  ConfigsFlag,
  CoercionsFlag,
  Options,
  OptionsDefault,
  ValueOf,
  YargsParserMixin
} from './yargs-parser-types.js'
import { DefaultValuesForTypeKey } from './yargs-parser-types.js'
import { camelCase, decamelize, looksLikeNumber } from './string-utils.js'

let mixin: YargsParserMixin

/**
 * AliasManager centralizes all alias-related bookkeeping within yargs-parser.
 *
 * Responsibilities:
 *  - Combine user-provided (possibly transitive) alias groups into bidirectional maps.
 *  - Register inferred aliases derived from configuration keys (opts.key/default/array/etc.).
 *  - Generate and track automatic camelCase / dashed aliases when
 *    configuration['camel-case-expansion'] is on.
 *  - Propagate default values across every alias of a key.
 *  - Answer "does this key or any of its aliases have flag X set?" queries.
 *  - Provide enumeration of all aliases for strip-aliased/strip-dashed cleanup.
 *
 * This class is intentionally internal and must NOT be exposed through the
 * public parser API.
 */
class AliasManager {
  // Bidirectional alias map: for every key we store all other aliases.
  private readonly aliases: Dictionary<string[]> = Object.create(null)
  // Tracks keys added automatically via camelCase expansion (so callers can
  // distinguish user-provided aliases from inferred ones).
  readonly newAliases: Dictionary<boolean> = Object.create(null)
  // Tracks which configuration setting currently applies for camel-case expansion.
  private readonly expandCamelCase: boolean
  // Tracks which flags have been explicitly registered (used to avoid
  // clobbering already-expanded aliases when a key is seen again).
  private readonly registered: Dictionary<boolean> = Object.create(null)

  constructor (
    userAliases: Dictionary<string | string[]> | undefined,
    expandCamelCase: boolean
  ) {
    this.expandCamelCase = !!expandCamelCase
    // 1. Normalize the user-provided aliases into groups of equivalent keys.
    const groups = combineAliasGroups(userAliases)
    // 2. For each group, build a bidirectional map: every key in the group
    //    points to all other keys in the same group.
    groups.forEach(group => {
      for (let i = 0; i < group.length; i++) {
        const key = group[i]
        this.aliases[key] = group.filter(other => other !== key)
      }
    })
  }

  /**
   * Register a key whose aliases should also benefit from camelCase expansion.
   * This mirrors the legacy `extendAliases` step: only runs the first time a
   * key is seen, and adds camelCase / dashed variants for every member of the
   * key's alias group (including the key itself).
   */
  extendFromKey (key: string): void {
    if (this.registered[key]) return
    this.registered[key] = true

    // Seed aliases[key] if this key has no user-provided aliases.
    if (!this.aliases[key]) this.aliases[key] = []

    // For every current member of the group (key + existing aliases) look at
    // both the dashed and the camelCase form.
    const members = [key].concat(this.aliases[key])
    members.forEach(member => {
      this.addDerivedAliases(key, member)
    })

    // Rebuild the bidirectional map for the (potentially enlarged) group.
    this.syncBidirectionalMap(key)
  }

  /**
   * Given a key encountered at parse time (e.g. a dashed long form like
   * `--foo-bar`), ensure its camelCase sibling is registered as an alias.
   * This mirrors the legacy `addNewAlias` behaviour: the mapping is only
   * created the first time either side is seen.
   */
  addRuntimeAlias (key: string, alias: string): void {
    if (key === alias) return
    // Only create the mapping when the key currently has no aliases at all.
    // This preserves the legacy "first registration wins" semantics.
    if (!(this.aliases[key] && this.aliases[key].length)) {
      this.aliases[key] = [alias]
      this.newAliases[alias] = true
    }
    if (!(this.aliases[alias] && this.aliases[alias].length)) {
      this.addRuntimeAlias(alias, key)
    }
  }

  /**
   * Given a key, return the list of its aliases. Never returns `undefined` —
   * callers can safely iterate the result.
   */
  getAliases (key: string): string[] {
    return this.aliases[key] || []
  }

  /**
   * Return a snapshot of the full alias map. Used to populate the returned
   * `aliases` field of DetailedArguments.
   */
  snapshot (): Dictionary<string[]> {
    const out: Dictionary<string[]> = Object.create(null)
    Object.keys(this.aliases).forEach(k => {
      out[k] = this.aliases[k].slice()
    })
    return out
  }

  /**
   * Given a flag dictionary (bools/strings/numbers/arrays/coercions/...),
   * return the value stored against `key` OR any of its aliases.
   * This is the refactored `checkAllAliases`.
   */
  checkFlag<K extends Flag> (key: string, flag: K): ValueOf<K> | false {
    const toCheck = this.getAliases(key).concat(key)
    const keys = Object.keys(flag as Dictionary<any>)
    const setAlias = toCheck.find(k => keys.indexOf(k) !== -1)
    return setAlias ? (flag as Dictionary<any>)[setAlias] : false
  }

  /**
   * Copy defaults across every alias of each default key, so that querying
   * `defaults[alias]` returns the same value as `defaults[key]`. Modifies the
   * `defaults` object in place.
   */
  propagateDefaults (defaults: Dictionary<any>): void {
    const keys = Object.keys(defaults)
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]
      const value = defaults[key]
      const keyAliases = this.getAliases(key)
      for (let j = 0; j < keyAliases.length; j++) {
        const alias = keyAliases[j]
        if (!(alias in defaults)) defaults[alias] = value
      }
    }
  }

  /**
   * Return a flat list of every alias (excluding the canonical keys) that has
   * been registered so far. Used for strip-aliased post-processing.
   */
  flattenAliases (): string[] {
    const out: string[] = []
    const keys = Object.keys(this.aliases)
    for (let i = 0; i < keys.length; i++) {
      for (let j = 0; j < this.aliases[keys[i]].length; j++) {
        out.push(this.aliases[keys[i]][j])
      }
    }
    return out
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private addDerivedAliases (primaryKey: string, member: string): void {
    // dashed -> camelCase
    if (this.expandCamelCase && /-/.test(member)) {
      const c = camelCase(member)
      this.registerDerivedAlias(primaryKey, member, c)
    }
    // camelCase -> dashed
    if (this.expandCamelCase && member.length > 1 && /[A-Z]/.test(member)) {
      const d = decamelize(member, '-')
      this.registerDerivedAlias(primaryKey, member, d)
    }
  }

  private registerDerivedAlias (primaryKey: string, member: string, derived: string): void {
    if (derived === primaryKey) return
    const list = this.aliases[primaryKey]
    // Avoid duplicates
    if (list.indexOf(derived) !== -1) return
    list.push(derived)
    this.newAliases[derived] = true
  }

  /**
   * After extending the alias group of `primaryKey`, make sure every other
   * member of the group also references every other member.
   */
  private syncBidirectionalMap (primaryKey: string): void {
    const members = [primaryKey].concat(this.aliases[primaryKey])
    for (let i = 0; i < members.length; i++) {
      const key = members[i]
      const other: string[] = []
      for (let j = 0; j < members.length; j++) {
        if (members[j] !== key) other.push(members[j])
      }
      this.aliases[key] = other
      // Register every member so we don't re-expand them later.
      this.registered[key] = true
    }
  }
}

/**
 * Combine user-provided alias declarations into equivalence groups.
 *
 * For example, given `{ a: ['b'], b: ['c'] }` this produces a single group
 * `[a, b, c]` (order is preserved by appearance).
 */
function combineAliasGroups (
  aliases: Dictionary<string | string[]> | undefined
): Array<string[]> {
  const groups: Array<string[]> = []
  if (!aliases) return groups

  const keys = Object.keys(aliases)
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]
    const group = ([] as string[]).concat(aliases[key] as any, key)
    groups.push(group)
  }

  // Repeatedly merge groups that intersect until stable.
  let changed = true
  while (changed) {
    changed = false
    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        const intersects = groups[i].some(v => groups[j].indexOf(v) !== -1)
        if (intersects) {
          groups[i] = groups[i].concat(groups[j])
          groups.splice(j, 1)
          changed = true
          break
        }
      }
    }
  }

  // Deduplicate within each group, preserving first-seen order.
  for (let i = 0; i < groups.length; i++) {
    const seen: Dictionary<boolean> = Object.create(null)
    const deduped: string[] = []
    for (let j = 0; j < groups[i].length; j++) {
      const v = groups[i][j]
      if (!seen[v]) {
        seen[v] = true
        deduped.push(v)
      }
    }
    groups[i] = deduped
  }

  return groups
}

// =============================================================================
// Parser
// =============================================================================

export class YargsParser {
  constructor (_mixin: YargsParserMixin) {
    mixin = _mixin
  }

  parse (argsInput: ArgsInput, options?: Partial<Options>): DetailedArguments {
    const opts: Partial<Options> = Object.assign({
      alias: undefined,
      array: undefined,
      boolean: undefined,
      config: undefined,
      configObjects: undefined,
      configuration: undefined,
      coerce: undefined,
      count: undefined,
      default: undefined,
      envPrefix: undefined,
      narg: undefined,
      normalize: undefined,
      string: undefined,
      number: undefined,
      __: undefined,
      key: undefined
    }, options)
    // allow a string argument to be passed in rather than an argv array.
    const args = tokenizeArgString(argsInput)
    // tokenizeArgString adds extra quotes to args if argsInput is a string
    // only strip those extra quotes in processValue if argsInput is a string
    const inputIsString = typeof argsInput === 'string'

    const configuration: Configuration = Object.assign({
      'boolean-negation': true,
      'camel-case-expansion': true,
      'combine-arrays': false,
      'dot-notation': true,
      'duplicate-arguments-array': true,
      'flatten-duplicate-arrays': true,
      'greedy-arrays': true,
      'halt-at-non-option': false,
      'nargs-eats-options': false,
      'negation-prefix': 'no-',
      'parse-numbers': true,
      'parse-positional-numbers': true,
      'populate--': false,
      'set-placeholder-key': false,
      'short-option-groups': true,
      'strip-aliased': false,
      'strip-dashed': false,
      'unknown-options-as-args': false
    }, opts.configuration)
    const defaults: OptionsDefault = Object.assign(Object.create(null), opts.default)
    const configObjects = opts.configObjects || []
    const envPrefix = opts.envPrefix
    const notFlagsOption = configuration['populate--']
    const notFlagsArgv: string = notFlagsOption ? '--' : '_'
    const defaulted: Dictionary<boolean> = Object.create(null)
    // allow a i18n handler to be passed in, default to a fake one (util.format).
    const __ = opts.__ || mixin.format
    const flags: Flags = {
      aliases: Object.create(null),
      arrays: Object.create(null),
      bools: Object.create(null),
      strings: Object.create(null),
      numbers: Object.create(null),
      counts: Object.create(null),
      normalize: Object.create(null),
      configs: Object.create(null),
      nargs: Object.create(null),
      coercions: Object.create(null),
      keys: []
    }
    const negative = /^-([0-9]+(\.[0-9]+)?|\.[0-9]+)$/
    const negatedBoolean = new RegExp('^--' + configuration['negation-prefix'] + '(.+)')

    // Centralised alias manager — replaces the old combineAliases / extendAliases
    // / addNewAlias / checkAllAliases helpers.
    const aliasManager = new AliasManager(opts.alias, configuration['camel-case-expansion'])

    // ---------------------------------------------------------------------
    // Register type/option keyed flags.
    // ---------------------------------------------------------------------
    ;([] as ArrayOption[]).concat(opts.array || []).filter(Boolean).forEach(function (opt) {
      const key = typeof opt === 'object' ? opt.key : opt

      // assign to flags[bools|strings|numbers]
      const assignment: ArrayFlagsKey | undefined = Object.keys(opt).map(function (key) {
        const arrayFlagKeys: Record<string, ArrayFlagsKey> = {
          boolean: 'bools',
          string: 'strings',
          number: 'numbers'
        }
        return arrayFlagKeys[key]
      }).filter(Boolean).pop()

      // assign key to be coerced
      if (assignment) {
        flags[assignment][key] = true
      }

      flags.arrays[key] = true
      flags.keys.push(key)
    })

    ;([] as string[]).concat(opts.boolean || []).filter(Boolean).forEach(function (key) {
      flags.bools[key] = true
      flags.keys.push(key)
    })

    ;([] as string[]).concat(opts.string || []).filter(Boolean).forEach(function (key) {
      flags.strings[key] = true
      flags.keys.push(key)
    })

    ;([] as string[]).concat(opts.number || []).filter(Boolean).forEach(function (key) {
      flags.numbers[key] = true
      flags.keys.push(key)
    })

    ;([] as string[]).concat(opts.count || []).filter(Boolean).forEach(function (key) {
      flags.counts[key] = true
      flags.keys.push(key)
    })

    ;([] as string[]).concat(opts.normalize || []).filter(Boolean).forEach(function (key) {
      flags.normalize[key] = true
      flags.keys.push(key)
    })

    if (typeof opts.narg === 'object') {
      Object.entries(opts.narg).forEach(([key, value]) => {
        if (typeof value === 'number') {
          flags.nargs[key] = value
          flags.keys.push(key)
        }
      })
    }

    if (typeof opts.coerce === 'object') {
      Object.entries(opts.coerce).forEach(([key, value]) => {
        if (typeof value === 'function') {
          flags.coercions[key] = value
          flags.keys.push(key)
        }
      })
    }

    if (typeof opts.config !== 'undefined') {
      if (Array.isArray(opts.config) || typeof opts.config === 'string') {
        ;([] as string[]).concat(opts.config).filter(Boolean).forEach(function (key) {
          flags.configs[key] = true
        })
      } else if (typeof opts.config === 'object') {
        Object.entries(opts.config).forEach(([key, value]) => {
          if (typeof value === 'boolean' || typeof value === 'function') {
            flags.configs[key] = value
          }
        })
      }
    }

    // ---------------------------------------------------------------------
    // Extend alias maps with inferred aliases from every known config source
    // (opts.key, opts.default, opts.array, etc.) and propagate default values
    // across all aliases.
    // ---------------------------------------------------------------------
    ;[opts.key, defaults, flags.arrays].forEach(function (obj) {
      Object.keys(obj || {}).forEach(function (key) {
        aliasManager.extendFromKey(key)
      })
    })
    aliasManager.propagateDefaults(defaults)

    // Mirror the final alias map into flags.aliases so legacy consumers (and
    // the DetailedArguments output) continue to work.
    const finalAliases = aliasManager.snapshot()
    Object.keys(finalAliases).forEach(k => {
      flags.aliases[k] = finalAliases[k]
    })

    let error: Error | null = null
    checkConfiguration()

    let notFlags: string[] = []

    const argv: Arguments = Object.assign(Object.create(null), { _: [] })
    // TODO(bcoe): for the first pass at removing object prototype  we didn't
    // remove all prototypes from objects returned by this API, we might want
    // to gradually move towards doing so.
    const argvReturn: { [argName: string]: any } = {}

    // ---------------------------------------------------------------------
    // Main argument-parsing loop.
    // ---------------------------------------------------------------------
    for (let i = 0; i < args.length; i++) {
      const arg = args[i]
      const truncatedArg = arg.replace(/^-{3,}/, '---')
      let key: string | undefined
      let letters: string[]
      let m: RegExpMatchArray | null
      let next: string
      let value: string

      // any unknown option (except for end-of-options, "--")
      if (arg !== '--' && /^-/.test(arg) && isUnknownOptionAsArg(arg)) {
        pushPositional(arg)
      // ---, ---=, ----, etc.,
      } else if (truncatedArg.match(/^---+(=|$)/)) {
        // options without key name are invalid.
        pushPositional(arg)
        continue
      // -- separated by =
      } else if (arg.match(/^--.+=/) || (
        !configuration['short-option-groups'] && arg.match(/^-.+=/)
      )) {
        m = arg.match(/^--?([^=]+)=([\s\S]*)$/)

        // arrays format = '--f=a b c'
        if (m !== null && Array.isArray(m) && m.length >= 3) {
          if (aliasManager.checkFlag(m[1], flags.arrays)) {
            i = eatArray(i, m[1], args, m[2])
          } else if (aliasManager.checkFlag(m[1], flags.nargs) !== false) {
            // nargs format = '--f=monkey washing cat'
            i = eatNargs(i, m[1], args, m[2])
          } else {
            setArg(m[1], m[2], true)
          }
        }
      } else if (arg.match(negatedBoolean) && configuration['boolean-negation']) {
        m = arg.match(negatedBoolean)
        if (m !== null && Array.isArray(m) && m.length >= 2) {
          key = m[1]
          setArg(key, aliasManager.checkFlag(key, flags.arrays) ? [false] : false)
        }

      // -- separated by space.
      } else if (arg.match(/^--.+/) || (
        !configuration['short-option-groups'] && arg.match(/^-[^-]+/) && !arg.match(negative)
      )) {
        m = arg.match(/^--?(.+)/)
        if (m !== null && Array.isArray(m) && m.length >= 2) {
          key = m[1]
          if (aliasManager.checkFlag(key, flags.arrays)) {
            // array format = '--foo a b c'
            i = eatArray(i, key, args)
          } else if (aliasManager.checkFlag(key, flags.nargs) !== false) {
            // nargs format = '--foo a b c'
            // should be truthy even if: flags.nargs[key] === 0
            i = eatNargs(i, key, args)
          } else {
            next = args[i + 1]

            if (next !== undefined && (!next.match(/^-/) ||
              next.match(negative)) &&
              !aliasManager.checkFlag(key, flags.bools) &&
              !aliasManager.checkFlag(key, flags.counts)) {
              setArg(key, next)
              i++
            } else if (/^(true|false)$/.test(next)) {
              setArg(key, next)
              i++
            } else {
              setArg(key, defaultValue(key))
            }
          }
        }

      // dot-notation flag separated by '='.
      } else if (arg.match(/^-.\..+=/)) {
        m = arg.match(/^-([^=]+)=([\s\S]*)$/)
        if (m !== null && Array.isArray(m) && m.length >= 3) {
          setArg(m[1], m[2])
        }

      // dot-notation flag separated by space.
      } else if (arg.match(/^-.\..+/) && !arg.match(negative)) {
        next = args[i + 1]
        m = arg.match(/^-(.\..+)/)
        if (m !== null && Array.isArray(m) && m.length >= 2) {
          key = m[1]
          if (next !== undefined && !next.match(/^-/) &&
            !aliasManager.checkFlag(key, flags.bools) &&
            !aliasManager.checkFlag(key, flags.counts)) {
            setArg(key, next)
            i++
          } else {
            setArg(key, defaultValue(key))
          }
        }
      } else if (arg.match(/^-[^-]+/) && !arg.match(negative)) {
        letters = arg.slice(1, -1).split('')
        let broken: boolean = false

        for (let j = 0; j < letters.length; j++) {
          next = arg.slice(j + 2)

          if (letters[j + 1] && letters[j + 1] === '=') {
            value = arg.slice(j + 3)
            key = letters[j]

            if (aliasManager.checkFlag(key, flags.arrays)) {
              // array format = '-f=a b c'
              i = eatArray(i, key, args, value)
            } else if (aliasManager.checkFlag(key, flags.nargs) !== false) {
              // nargs format = '-f=monkey washing cat'
              i = eatNargs(i, key, args, value)
            } else {
              setArg(key, value)
            }

            broken = true
            break
          }

          if (next === '-') {
            setArg(letters[j], next)
            continue
          }

          // current letter is an alphabetic character and next value is a number
          if (/[A-Za-z]/.test(letters[j]) &&
            /^-?\d+(\.\d*)?(e-?\d+)?$/.test(next) &&
            aliasManager.checkFlag(next, flags.bools) === false) {
            setArg(letters[j], next)
            broken = true
            break
          }

          if (letters[j + 1] && letters[j + 1].match(/\W/)) {
            setArg(letters[j], next)
            broken = true
            break
          } else {
            setArg(letters[j], defaultValue(letters[j]))
          }
        }

        key = arg.slice(-1)[0]

        if (!broken && key !== '-') {
          if (aliasManager.checkFlag(key, flags.arrays)) {
            // array format = '-f a b c'
            i = eatArray(i, key, args)
          } else if (aliasManager.checkFlag(key, flags.nargs) !== false) {
            // nargs format = '-f a b c'
            // should be truthy even if: flags.nargs[key] === 0
            i = eatNargs(i, key, args)
          } else {
            next = args[i + 1]

            if (next !== undefined && (!/^(-|--)[^-]/.test(next) ||
              next.match(negative)) &&
              !aliasManager.checkFlag(key, flags.bools) &&
              !aliasManager.checkFlag(key, flags.counts)) {
              setArg(key, next)
              i++
            } else if (/^(true|false)$/.test(next)) {
              setArg(key, next)
              i++
            } else {
              setArg(key, defaultValue(key))
            }
          }
        }
      } else if (arg.match(/^-[0-9]$/) &&
        arg.match(negative) &&
        aliasManager.checkFlag(arg.slice(1), flags.bools)) {
        // single-digit boolean alias, e.g: xargs -0
        key = arg.slice(1)
        setArg(key, defaultValue(key))
      } else if (arg === '--') {
        notFlags = args.slice(i + 1)
        break
      } else if (configuration['halt-at-non-option']) {
        notFlags = args.slice(i)
        break
      } else {
        pushPositional(arg)
      }
    }

    // order of precedence:
    // 1. command line arg
    // 2. value from env var
    // 3. value from config file
    // 4. value from config objects
    // 5. configured default value
    applyEnvVars(argv, true) // special case: check env vars that point to config file
    applyEnvVars(argv, false)
    setConfig(argv)
    setConfigObjects()
    applyDefaultsAndAliases(argv, true)
    applyCoercions(argv)
    if (configuration['set-placeholder-key']) setPlaceholderKeys(argv)

    // for any counts either not in args or without an explicit default, set to 0
    Object.keys(flags.counts).forEach(function (key) {
      if (!hasKey(argv, key.split('.'))) setArg(key, 0)
    })

    // '--' defaults to undefined.
    if (notFlagsOption && notFlags.length) argv[notFlagsArgv] = []
    notFlags.forEach(function (key) {
      argv[notFlagsArgv].push(key)
    })

    if (configuration['camel-case-expansion'] && configuration['strip-dashed']) {
      Object.keys(argv).filter(key => key !== '--' && key.includes('-')).forEach(key => {
        delete argv[key]
      })
    }

    if (configuration['strip-aliased']) {
      aliasManager.flattenAliases().forEach(alias => {
        if (configuration['camel-case-expansion'] && alias.includes('-')) {
          delete argv[alias.split('.').map(prop => camelCase(prop)).join('.')]
        }
        delete argv[alias]
      })
    }

    // ---------------------------------------------------------------------
    // End of main parse routine. The remainder of the file consists of the
    // helper closures that capture argv / flags / configuration.
    // ---------------------------------------------------------------------

    function pushPositional (arg: string) {
      const maybeCoercedNumber = maybeCoerceNumber('_', arg)
      if (typeof maybeCoercedNumber === 'string' || typeof maybeCoercedNumber === 'number') {
        argv._.push(maybeCoercedNumber)
      }
    }

    // how many arguments should we consume, based
    // on the nargs option?
    function eatNargs (i: number, key: string, args: string[], argAfterEqualSign?: string): number {
      let ii
      let toEat = aliasManager.checkFlag(key, flags.nargs)
      // NaN has a special meaning for the array type, indicating that one or
      // more values are expected.
      toEat = typeof toEat !== 'number' || isNaN(toEat as number) ? 1 : (toEat as number)

      if (toEat === 0) {
        if (!isUndefined(argAfterEqualSign)) {
          error = Error(__('Argument unexpected for: %s', key))
        }
        setArg(key, defaultValue(key))
        return i
      }

      let available = isUndefined(argAfterEqualSign) ? 0 : 1
      if (configuration['nargs-eats-options']) {
        // classic behavior, yargs eats positional and dash arguments.
        if (args.length - (i + 1) + available < toEat) {
          error = Error(__('Not enough arguments following: %s', key))
        }
        available = toEat
      } else {
        // nargs will not consume flag arguments, e.g., -abc, --foo,
        // and terminates when one is observed.
        for (ii = i + 1; ii < args.length; ii++) {
          if (!args[ii].match(/^-[^0-9]/) || args[ii].match(negative) || isUnknownOptionAsArg(args[ii])) available++
          else break
        }
        if (available < toEat) error = Error(__('Not enough arguments following: %s', key))
      }

      let consumed = Math.min(available, toEat)
      if (!isUndefined(argAfterEqualSign) && consumed > 0) {
        setArg(key, argAfterEqualSign)
        consumed--
      }
      for (ii = i + 1; ii < (consumed + i + 1); ii++) {
        setArg(key, args[ii])
      }

      return (i + consumed)
    }

    // if an option is an array, eat all non-hyphenated arguments
    // following it... YUM!
    // e.g., --foo apple banana cat becomes ["apple", "banana", "cat"]
    function eatArray (i: number, key: string, args: string[], argAfterEqualSign?: string): number {
      let argsToSet: any[] = []
      let next = argAfterEqualSign || args[i + 1]
      // If both array and nargs are configured, enforce the nargs count:
      const nargsCount = aliasManager.checkFlag(key, flags.nargs)

      if (aliasManager.checkFlag(key, flags.bools) && !(/^(true|false)$/.test(next))) {
        argsToSet.push(true)
      } else if (isUndefined(next) ||
          (isUndefined(argAfterEqualSign) && /^-/.test(next) && !negative.test(next) && !isUnknownOptionAsArg(next))) {
        // for keys without value ==> argsToSet remains an empty []
        // set user default value, if available
        if (defaults[key] !== undefined) {
          const defVal = defaults[key]
          argsToSet = Array.isArray(defVal) ? defVal : [defVal]
        }
      } else {
        // value in --option=value is eaten as is
        if (!isUndefined(argAfterEqualSign)) {
          argsToSet.push(processValue(key, argAfterEqualSign, true))
        }
        for (let ii = i + 1; ii < args.length; ii++) {
          if ((!configuration['greedy-arrays'] && argsToSet.length > 0) ||
            (nargsCount && typeof nargsCount === 'number' && argsToSet.length >= nargsCount)) break
          next = args[ii]
          if (/^-/.test(next) && !negative.test(next) && !isUnknownOptionAsArg(next)) break
          i = ii
          argsToSet.push(processValue(key, next, inputIsString))
        }
      }

      // If both array and nargs are configured, create an error if less than
      // nargs positionals were found. NaN has special meaning, indicating
      // that at least one value is required (more are okay).
      if (typeof nargsCount === 'number' && ((nargsCount && argsToSet.length < nargsCount) ||
          (isNaN(nargsCount) && argsToSet.length === 0))) {
        error = Error(__('Not enough arguments following: %s', key))
      }

      setArg(key, argsToSet)
      return i
    }

    function setArg (key: string, val: any, shouldStripQuotes: boolean = inputIsString): void {
      // Automatically add a camelCase alias when the key looks dashed.
      if (/-/.test(key) && configuration['camel-case-expansion']) {
        const alias = key.split('.').map(function (prop) {
          return camelCase(prop)
        }).join('.')
        aliasManager.addRuntimeAlias(key, alias)
        // Keep the shared flags.aliases view in sync with the manager.
        const updated = aliasManager.snapshot()
        Object.keys(updated).forEach(k => {
          flags.aliases[k] = updated[k]
        })
      }

      const value = processValue(key, val, shouldStripQuotes)
      const splitKey = key.split('.')
      setKey(argv, splitKey, value)

      const keyAliases = aliasManager.getAliases(key)

      // handle populating aliases of the full key
      if (keyAliases.length) {
        keyAliases.forEach(function (x) {
          const keyProperties = x.split('.')
          setKey(argv, keyProperties, value)
        })
      }

      // handle populating aliases of the first element of the dot-notation key
      if (splitKey.length > 1 && configuration['dot-notation']) {
        const headAliases = aliasManager.getAliases(splitKey[0])
        headAliases.forEach(function (x) {
          let keyProperties = x.split('.')

          // expand alias with nested objects in key
          const a = ([] as string[]).concat(splitKey)
          a.shift() // nuke the old key.
          keyProperties = keyProperties.concat(a)

          // populate alias only if it is not already an alias of the full key
          // (already populated above)
          if (keyAliases.indexOf(keyProperties.join('.')) === -1) {
            setKey(argv, keyProperties, value)
          }
        })
      }

      // Set normalize getter and setter when key is in 'normalize' but isn't an array
      if (aliasManager.checkFlag(key, flags.normalize) && !aliasManager.checkFlag(key, flags.arrays)) {
        const keys = [key].concat(keyAliases)
        keys.forEach(function (k) {
          Object.defineProperty(argvReturn, k, {
            enumerable: true,
            get () {
              return val
            },
            set (newVal) {
              val = typeof newVal === 'string' ? mixin.normalize(newVal) : newVal
            }
          })
        })
      }
    }

    function processValue (key: string, val: any, shouldStripQuotes: boolean) {
      // strings may be quoted, clean this up as we assign values.
      if (shouldStripQuotes) {
        val = stripQuotes(val)
      }

      // handle parsing boolean arguments --foo=true --bar false.
      if (aliasManager.checkFlag(key, flags.bools) || aliasManager.checkFlag(key, flags.counts)) {
        if (typeof val === 'string') val = val === 'true'
      }

      let value = Array.isArray(val)
        ? val.map(function (v) { return maybeCoerceNumber(key, v) })
        : maybeCoerceNumber(key, val)

      // increment a count given as arg (either no value or value parsed as boolean)
      if (aliasManager.checkFlag(key, flags.counts) && (isUndefined(value) || typeof value === 'boolean')) {
        value = increment()
      }

      // Set normalized value when key is in 'normalize' and in 'arrays'
      if (aliasManager.checkFlag(key, flags.normalize) && aliasManager.checkFlag(key, flags.arrays)) {
        if (Array.isArray(val)) value = val.map((v) => { return mixin.normalize(v) })
        else value = mixin.normalize(val)
      }
      return value
    }

    function maybeCoerceNumber (key: string, value: string | number | null | undefined) {
      if (!configuration['parse-positional-numbers'] && key === '_') return value
      if (!aliasManager.checkFlag(key, flags.strings) && !aliasManager.checkFlag(key, flags.bools) && !Array.isArray(value)) {
        const shouldCoerceNumber = looksLikeNumber(value) && configuration['parse-numbers'] && (
          Number.isSafeInteger(Math.floor(parseFloat(`${value}`)))
        )
        if (shouldCoerceNumber || (!isUndefined(value) && aliasManager.checkFlag(key, flags.numbers))) {
          value = Number(value)
        }
      }
      return value
    }

    // set args from config.json file, this should be
    // applied last so that defaults can be applied.
    function setConfig (argv: Arguments): void {
      const configLookup = Object.create(null)

      // expand defaults/aliases, in-case any happen to reference
      // the config.json file.
      applyDefaultsAndAliases(configLookup, false)

      Object.keys(flags.configs).forEach(function (configKey) {
        const configPath = argv[configKey] || configLookup[configKey]
        if (configPath) {
          try {
            let config = null
            const resolvedConfigPath = mixin.resolve(mixin.cwd(), configPath)
            const resolveConfig = flags.configs[configKey]

            if (typeof resolveConfig === 'function') {
              try {
                config = resolveConfig(resolvedConfigPath)
              } catch (e) {
                config = e
              }
              if (config instanceof Error) {
                error = config
                return
              }
            } else {
              config = mixin.require(resolvedConfigPath)
            }

            setConfigObject(config)
          } catch (ex: any) {
            // Deno will receive a PermissionDenied error if an attempt is
            // made to load config without the --allow-read flag:
            if (ex.name === 'PermissionDenied') error = ex
            else if (argv[configKey]) error = Error(__('Invalid JSON config file: %s', configPath))
          }
        }
      })
    }

    // set args from config object.
    // it recursively checks nested objects.
    function setConfigObject (config: { [key: string]: any }, prev?: string): void {
      Object.keys(config).forEach(function (key) {
        const value = config[key]
        const fullKey = prev ? prev + '.' + key : key

        // if the value is an inner object and we have dot-notation
        // enabled, treat inner objects in config the same as
        // heavily nested dot notations (foo.bar.apple).
        if (typeof value === 'object' && value !== null && !Array.isArray(value) && configuration['dot-notation']) {
          // if the value is an object but not an array, check nested object
          setConfigObject(value, fullKey)
        } else {
          // setting arguments via CLI takes precedence over
          // values within the config file.
          if (!hasKey(argv, fullKey.split('.')) || (aliasManager.checkFlag(fullKey, flags.arrays) && configuration['combine-arrays'])) {
            setArg(fullKey, value)
          }
        }
      })
    }

    // set all config objects passed in opts
    function setConfigObjects (): void {
      if (typeof configObjects !== 'undefined') {
        configObjects.forEach(function (configObject) {
          setConfigObject(configObject)
        })
      }
    }

    function applyEnvVars (argv: Arguments, configOnly: boolean): void {
      if (typeof envPrefix === 'undefined') return

      const prefix = typeof envPrefix === 'string' ? envPrefix : ''
      const env = mixin.env()
      Object.keys(env).forEach(function (envVar) {
        if (prefix === '' || envVar.lastIndexOf(prefix, 0) === 0) {
          // get array of nested keys and convert them to camel case
          const keys = envVar.split('__').map(function (key, i) {
            if (i === 0) {
              key = key.substring(prefix.length)
            }
            return camelCase(key)
          })

          if (((configOnly && flags.configs[keys.join('.')]) || !configOnly) && !hasKey(argv, keys)) {
            setArg(keys.join('.'), env[envVar])
          }
        }
      })
    }

    function applyCoercions (argv: Arguments): void {
      const applied: Set<string> = new Set()
      Object.keys(argv).forEach(function (key) {
        if (!applied.has(key)) { // If we haven't already coerced this option via one of its aliases
          const coerce = aliasManager.checkFlag(key, flags.coercions) as false | CoerceCallback
          if (typeof coerce === 'function') {
            try {
              const value = maybeCoerceNumber(key, coerce(argv[key]))
              ;(([] as string[]).concat(aliasManager.getAliases(key), key)).forEach(ali => {
                applied.add(ali)
                argv[ali] = value
              })
            } catch (err) {
              error = err as Error
            }
          }
        }
      })
    }

    function setPlaceholderKeys (argv: Arguments): Arguments {
      flags.keys.forEach((key) => {
        // don't set placeholder keys for dot notation options 'foo.bar'.
        if (~key.indexOf('.')) return
        if (typeof argv[key] === 'undefined') argv[key] = undefined
      })
      return argv
    }

    function applyDefaultsAndAliases (obj: { [key: string]: any }, canLog: boolean): void {
      Object.keys(defaults).forEach(function (key) {
        if (!hasKey(obj, key.split('.'))) {
          setKey(obj, key.split('.'), defaults[key])
          if (canLog) defaulted[key] = true

          aliasManager.getAliases(key).forEach(function (x) {
            if (hasKey(obj, x.split('.'))) return
            setKey(obj, x.split('.'), defaults[key])
          })
        }
      })
    }

    function hasKey (obj: { [key: string]: any }, keys: string[]): boolean {
      let o = obj

      if (!configuration['dot-notation']) keys = [keys.join('.')]

      keys.slice(0, -1).forEach(function (key) {
        o = (o[key] || {})
      })

      const key = keys[keys.length - 1]

      if (typeof o !== 'object') return false
      else return key in o
    }

    function setKey (obj: { [key: string]: any }, keys: string[], value: any): void {
      let o = obj

      if (!configuration['dot-notation']) keys = [keys.join('.')]

      keys.slice(0, -1).forEach(function (key) {
        // TODO(bcoe): in the next major version of yargs, switch to
        // Object.create(null) for dot notation:
        key = sanitizeKey(key)

        if (typeof o === 'object' && o[key] === undefined) {
          o[key] = {}
        }

        if (typeof o[key] !== 'object' || Array.isArray(o[key])) {
          // ensure that o[key] is an array, and that the last item is an empty object.
          if (Array.isArray(o[key])) {
            o[key].push({})
          } else {
            o[key] = [o[key], {}]
          }

          // we want to update the empty object at the end of the o[key] array, so set o to that object
          o = o[key][o[key].length - 1]
        } else {
          o = o[key]
        }
      })

      // TODO(bcoe): in the next major version of yargs, switch to
      // Object.create(null) for dot notation:
      const key = sanitizeKey(keys[keys.length - 1])

      const isTypeArray = aliasManager.checkFlag(keys.join('.'), flags.arrays)
      const isValueArray = Array.isArray(value)
      let duplicate = configuration['duplicate-arguments-array']

      // nargs has higher priority than duplicate
      if (!duplicate && aliasManager.checkFlag(key, flags.nargs)) {
        duplicate = true
        if ((!isUndefined(o[key]) && flags.nargs[key] === 1) || (Array.isArray(o[key]) && o[key].length === flags.nargs[key])) {
          o[key] = undefined
        }
      }

      if (value === increment()) {
        o[key] = increment(o[key])
      } else if (Array.isArray(o[key])) {
        if (duplicate && isTypeArray && isValueArray) {
          o[key] = configuration['flatten-duplicate-arrays'] ? o[key].concat(value) : (Array.isArray(o[key][0]) ? o[key] : [o[key]]).concat([value])
        } else if (!duplicate && Boolean(isTypeArray) === Boolean(isValueArray)) {
          o[key] = value
        } else {
          o[key] = o[key].concat([value])
        }
      } else if (o[key] === undefined && isTypeArray) {
        o[key] = isValueArray ? value : [value]
      } else if (duplicate && !(
        o[key] === undefined ||
          aliasManager.checkFlag(key, flags.counts) ||
          aliasManager.checkFlag(key, flags.bools)
      )) {
        o[key] = [o[key], value]
      } else {
        o[key] = value
      }
    }

    function hasAnyFlag (key: string): boolean {
      const flagsKeys = Object.keys(flags) as FlagsKey[]
      const toCheck = ([] as Array<{ [key: string]: any } | string[]>).concat(flagsKeys.map(k => flags[k]))
      return toCheck.some(function (flag) {
        return Array.isArray(flag) ? flag.indexOf(key) !== -1 : flag[key]
      })
    }

    function hasFlagsMatching (arg: string, ...patterns: RegExp[]): boolean {
      const toCheck = ([] as RegExp[]).concat(...patterns)
      return toCheck.some(function (pattern) {
        const match = arg.match(pattern)
        return match && hasAnyFlag(match[1])
      })
    }

    // based on a simplified version of the short flag group parsing logic
    function hasAllShortFlags (arg: string): boolean {
      // if this is a negative number, or doesn't start with a single hyphen, it's not a short flag group
      if (arg.match(negative) || !arg.match(/^-[^-]+/)) { return false }
      let hasAllFlags = true
      let next: string
      const letters = arg.slice(1).split('')
      for (let j = 0; j < letters.length; j++) {
        next = arg.slice(j + 2)

        if (!hasAnyFlag(letters[j])) {
          hasAllFlags = false
          break
        }

        if ((letters[j + 1] && letters[j + 1] === '=') ||
          next === '-' ||
          (/[A-Za-z]/.test(letters[j]) && /^-?\d+(\.\d*)?(e-?\d+)?$/.test(next)) ||
          (letters[j + 1] && letters[j + 1].match(/\W/))) {
          break
        }
      }
      return hasAllFlags
    }

    function isUnknownOptionAsArg (arg: string): boolean {
      return configuration['unknown-options-as-args'] && isUnknownOption(arg)
    }

    function isUnknownOption (arg: string): boolean {
      arg = arg.replace(/^-{3,}/, '--')
      // ignore negative numbers
      if (arg.match(negative)) { return false }
      // if this is a short option group and all of them are configured, it isn't unknown
      if (configuration['short-option-groups'] && hasAllShortFlags(arg)) { return false }
      // e.g., '--count=2'
      const flagWithEquals = /^-+([^=]+?)=[\s\S]*$/
      // e.g., '-a' or '--arg'
      const normalFlag = /^-+([^=]+?)$/
      // check the different types of flag styles, including negatedBoolean, a pattern defined near the start of the parse method
      return !hasFlagsMatching(arg, flagWithEquals, negatedBoolean, normalFlag)
    }

    // make a best effort to pick a default value
    // for an option based on name and type.
    function defaultValue (key: string) {
      if (!aliasManager.checkFlag(key, flags.bools) &&
          !aliasManager.checkFlag(key, flags.counts) &&
          `${key}` in defaults) {
        return defaults[key]
      } else {
        return defaultForType(guessType(key))
      }
    }

    // return a default value, given the type of a flag.,
    function defaultForType<K extends DefaultValuesForTypeKey> (type: K): DefaultValuesForType[K] {
      const def: DefaultValuesForType = {
        [DefaultValuesForTypeKey.BOOLEAN]: true,
        [DefaultValuesForTypeKey.STRING]: '',
        [DefaultValuesForTypeKey.NUMBER]: undefined,
        [DefaultValuesForTypeKey.ARRAY]: []
      }

      return def[type]
    }

    // given a flag, enforce a default type.
    function guessType (key: string): DefaultValuesForTypeKey {
      let type: DefaultValuesForTypeKey = DefaultValuesForTypeKey.BOOLEAN
      if (aliasManager.checkFlag(key, flags.strings)) type = DefaultValuesForTypeKey.STRING
      else if (aliasManager.checkFlag(key, flags.numbers)) type = DefaultValuesForTypeKey.NUMBER
      else if (aliasManager.checkFlag(key, flags.bools)) type = DefaultValuesForTypeKey.BOOLEAN
      else if (aliasManager.checkFlag(key, flags.arrays)) type = DefaultValuesForTypeKey.ARRAY
      return type
    }

    function isUndefined (num: any): num is undefined {
      return num === undefined
    }

    // check user configuration settings for inconsistencies
    function checkConfiguration (): void {
      // count keys should not be set as array/narg
      Object.keys(flags.counts).find(key => {
        if (aliasManager.checkFlag(key, flags.arrays)) {
          error = Error(__('Invalid configuration: %s, opts.count excludes opts.array.', key))
          return true
        } else if (aliasManager.checkFlag(key, flags.nargs)) {
          error = Error(__('Invalid configuration: %s, opts.count excludes opts.narg.', key))
          return true
        }
        return false
      })
    }

    return {
      aliases: aliasManager.snapshot(),
      argv: Object.assign(argvReturn, argv),
      configuration: configuration,
      defaulted: Object.assign({}, defaulted),
      error: error,
      newAliases: Object.assign({}, aliasManager.newAliases)
    }
  }
}

// this function should only be called when a count is given as an arg
// it is NOT called to set a default value
// thus we can start the count at 1 instead of 0
function increment (orig?: number | undefined): number {
  return orig !== undefined ? orig + 1 : 1
}

// TODO(bcoe): in the next major version of yargs, switch to
// Object.create(null) for dot notation:
function sanitizeKey (key: string): string {
  if (key === '__proto__') return '___proto___'
  return key
}

function stripQuotes (val: string): string {
  return (
    typeof val === 'string' &&
    (val[0] === "'" || val[0] === '"') &&
    val[val.length - 1] === val[0]
  )
    ? val.substring(1, val.length - 1)
    : val
}

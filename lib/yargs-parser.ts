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
    // allow a string argument to be passed in rather
    // than an argv array.
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
    const aliases = combineAliases(sanitizeAliasesMap(Object.assign(Object.create(null), opts.alias)))
    const defaults: OptionsDefault = sanitizeObjectKeys(Object.assign(Object.create(null), opts.default))
    const configObjects = opts.configObjects || []
    const envPrefix = opts.envPrefix
    const notFlagsOption = configuration['populate--']
    const notFlagsArgv: string = notFlagsOption ? '--' : '_'
    const newAliases: Dictionary<boolean> = Object.create(null)
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

    ;([] as ArrayOption[]).concat(opts.array || []).filter(Boolean).forEach(function (opt) {
      const key = normalizeKey(typeof opt === 'object' ? opt.key : opt)

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
      key = normalizeKey(key)
      flags.bools[key] = true
      flags.keys.push(key)
    })

    ;([] as string[]).concat(opts.string || []).filter(Boolean).forEach(function (key) {
      key = normalizeKey(key)
      flags.strings[key] = true
      flags.keys.push(key)
    })

    ;([] as string[]).concat(opts.number || []).filter(Boolean).forEach(function (key) {
      key = normalizeKey(key)
      flags.numbers[key] = true
      flags.keys.push(key)
    })

    ;([] as string[]).concat(opts.count || []).filter(Boolean).forEach(function (key) {
      key = normalizeKey(key)
      flags.counts[key] = true
      flags.keys.push(key)
    })

    ;([] as string[]).concat(opts.normalize || []).filter(Boolean).forEach(function (key) {
      key = normalizeKey(key)
      flags.normalize[key] = true
      flags.keys.push(key)
    })

    if (typeof opts.narg === 'object') {
      Object.entries(opts.narg).forEach(([key, value]) => {
        key = normalizeKey(key)
        if (typeof value === 'number') {
          flags.nargs[key] = value
          flags.keys.push(key)
        }
      })
    }

    if (typeof opts.coerce === 'object') {
      Object.entries(opts.coerce).forEach(([key, value]) => {
        key = normalizeKey(key)
        if (typeof value === 'function') {
          flags.coercions[key] = value
          flags.keys.push(key)
        }
      })
    }

    if (typeof opts.config !== 'undefined') {
      if (Array.isArray(opts.config) || typeof opts.config === 'string') {
        ;([] as string[]).concat(opts.config).filter(Boolean).forEach(function (key) {
          flags.configs[normalizeKey(key)] = true
        })
      } else if (typeof opts.config === 'object') {
        Object.entries(opts.config).forEach(([key, value]) => {
          key = normalizeKey(key)
          if (typeof value === 'boolean' || typeof value === 'function') {
            flags.configs[key] = value
          }
        })
      }
    }

    // create a lookup table that takes into account all
    // combinations of aliases: {f: ['foo'], foo: ['f']}
    extendAliases(opts.key, aliases, opts.default, flags.arrays)

    // apply default values to all aliases.
    Object.keys(defaults).forEach(function (key) {
      (flags.aliases[key] || []).forEach(function (alias) {
        defaults[alias] = defaults[key]
      })
    })

    let error: Error | null = null
    checkConfiguration()

    let notFlags: string[] = []

    const argv: Arguments = Object.assign(Object.create(null), { _: [] })
    // TODO(bcoe): for the first pass at removing object prototype  we didn't
    // remove all prototypes from objects returned by this API, we might want
    // to gradually move towards doing so.
    const argvReturn: { [argName: string]: any } = {}

    for (let i = 0; i < args.length; i++) {
      const arg = args[i]
      const truncatedArg = arg.replace(/^-{3,}/, '---')
      let broken: boolean
      let key: string | undefined
      let letters: string[]
      let m: RegExpMatchArray | null
      let next: string
      let value: string

      // any unknown option (except for end-of-options, "--")
      if (arg !== '--' && /^-/.test(arg) && isUnknownOptionAsArg(arg)) {
        pushPositional(arg)
      // ---, ---=, ----, etc,
      } else if (truncatedArg.match(/^---+(=|$)/)) {
        // options without key name are invalid.
        pushPositional(arg)
        continue
      // -- separated by =
      } else if (arg.match(/^--.+=/) || (
        !configuration['short-option-groups'] && arg.match(/^-.+=/)
      )) {
        // Using [\s\S] instead of . because js doesn't support the
        // 'dotall' regex modifier. See:
        // http://stackoverflow.com/a/1068308/13216
        m = arg.match(/^--?([^=]+)=([\s\S]*)$/)

        // arrays format = '--f=a b c'
        if (m !== null && Array.isArray(m) && m.length >= 3) {
          if (checkAllAliases(m[1], flags.arrays)) {
            i = eatArray(i, m[1], args, m[2])
          } else if (checkAllAliases(m[1], flags.nargs) !== false) {
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
          setArg(key, checkAllAliases(key, flags.arrays) ? [false] : false)
        }

      // -- separated by space.
      } else if (arg.match(/^--.+/) || (
        !configuration['short-option-groups'] && arg.match(/^-[^-]+/) && !arg.match(negative)
      )) {
        m = arg.match(/^--?(.+)/)
        if (m !== null && Array.isArray(m) && m.length >= 2) {
          key = m[1]
          if (checkAllAliases(key, flags.arrays)) {
            // array format = '--foo a b c'
            i = eatArray(i, key, args)
          } else if (checkAllAliases(key, flags.nargs) !== false) {
            // nargs format = '--foo a b c'
            // should be truthy even if: flags.nargs[key] === 0
            i = eatNargs(i, key, args)
          } else {
            next = args[i + 1]

            if (next !== undefined && (!next.match(/^-/) ||
              next.match(negative)) &&
              !checkAllAliases(key, flags.bools) &&
              !checkAllAliases(key, flags.counts)) {
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
            !checkAllAliases(key, flags.bools) &&
            !checkAllAliases(key, flags.counts)) {
            setArg(key, next)
            i++
          } else {
            setArg(key, defaultValue(key))
          }
        }
      } else if (arg.match(/^-[^-]+/) && !arg.match(negative)) {
        letters = arg.slice(1, -1).split('')
        broken = false

        for (let j = 0; j < letters.length; j++) {
          next = arg.slice(j + 2)

          if (letters[j + 1] && letters[j + 1] === '=') {
            value = arg.slice(j + 3)
            key = letters[j]

            if (checkAllAliases(key, flags.arrays)) {
              // array format = '-f=a b c'
              i = eatArray(i, key, args, value)
            } else if (checkAllAliases(key, flags.nargs) !== false) {
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
            checkAllAliases(next, flags.bools) === false) {
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
          if (checkAllAliases(key, flags.arrays)) {
            // array format = '-f a b c'
            i = eatArray(i, key, args)
          } else if (checkAllAliases(key, flags.nargs) !== false) {
            // nargs format = '-f a b c'
            // should be truthy even if: flags.nargs[key] === 0
            i = eatNargs(i, key, args)
          } else {
            next = args[i + 1]

            if (next !== undefined && (!/^(-|--)[^-]/.test(next) ||
              next.match(negative)) &&
              !checkAllAliases(key, flags.bools) &&
              !checkAllAliases(key, flags.counts)) {
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
        checkAllAliases(arg.slice(1), flags.bools)) {
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
    applyDefaultsAndAliases(argv, flags.aliases, defaults, true)
    applyCoercions(argv)
    if (configuration['set-placeholder-key']) setPlaceholderKeys(argv)

    // for any counts either not in args or without an explicit default, set to 0
    Object.keys(flags.counts).forEach(function (key) {
      if (!hasKey(argv, keyToSegments(key))) setArg(key, 0)
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
      ;([] as string[]).concat(...Object.keys(aliases).map(k => aliases[k])).forEach(alias => {
        if (configuration['camel-case-expansion'] && alias.includes('-')) {
          delete argv[normalizeKey(alias.split('.').map(prop => camelCase(prop)).join('.'))]
        }

        delete argv[normalizeKey(alias)]
      })
    }

    function normalizeKey (key: string): string {
      return normalizeKeyForConfig(key, configuration['dot-notation'])
    }

    function keyToSegments (key: string): string[] {
      return keyToSegmentsForConfig(key, configuration['dot-notation'])
    }

    function normalizeKeys (keys: string[]): string[] {
      return normalizeKeysForConfig(keys, configuration['dot-notation'])
    }

    function sanitizeAliasesMap (input?: Dictionary<string | string[]>): Dictionary<string[]> {
      const sanitized: Dictionary<string[]> = Object.create(null)
      Object.keys(input || {}).forEach(key => {
        const normalizedKey = normalizeKey(key)
        sanitized[normalizedKey] = ([] as string[]).concat(sanitized[normalizedKey] || [], (input as Dictionary<string | string[]>)[key]).filter(Boolean).map(alias => normalizeKey(alias))
      })
      return sanitized
    }

    function sanitizeObjectKeys<T> (input?: Dictionary<T>): Dictionary<T> {
      const sanitized: Dictionary<T> = Object.create(null)
      Object.keys(input || {}).forEach(key => {
        sanitized[normalizeKey(key)] = (input as Dictionary<T>)[key]
      })
      return sanitized
    }

    // Push argument into positional array, applying numeric coercion:
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
      let toEat = checkAllAliases(key, flags.nargs)
      // NaN has a special meaning for the array type, indicating that one or
      // more values are expected.
      toEat = typeof toEat !== 'number' || isNaN(toEat) ? 1 : toEat

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
      let argsToSet = []
      let next = argAfterEqualSign || args[i + 1]
      // If both array and nargs are configured, enforce the nargs count:
      const nargsCount = checkAllAliases(key, flags.nargs)

      if (checkAllAliases(key, flags.bools) && !(/^(true|false)$/.test(next))) {
        argsToSet.push(true)
      } else if (isUndefined(next) ||
          (isUndefined(argAfterEqualSign) && /^-/.test(next) && !negative.test(next) && !isUnknownOptionAsArg(next))) {
        const normalizedKey = normalizeKey(key)
        if (defaults[normalizedKey] !== undefined) {
          const defVal = defaults[normalizedKey]
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
      key = normalizeKey(key)

      if (/-/.test(key) && configuration['camel-case-expansion']) {
        const alias = normalizeKey(key.split('.').map(function (prop) {
          return camelCase(prop)
        }).join('.'))
        addNewAlias(key, alias)
      }

      const value = processValue(key, val, shouldStripQuotes)
      const splitKey = keyToSegments(key)
      setKey(argv, splitKey, value)

      if (flags.aliases[key]) {
        flags.aliases[key].forEach(function (x) {
          setKey(argv, keyToSegments(x), value)
        })
      }

      if (splitKey.length > 1 && configuration['dot-notation']) {
        ;(flags.aliases[splitKey[0]] || []).forEach(function (x) {
          let keyProperties = keyToSegments(x)
          const a = ([] as string[]).concat(splitKey)
          a.shift()
          keyProperties = keyProperties.concat(a)

          if (!(flags.aliases[key] || []).includes(keyProperties.join('.'))) {
            setKey(argv, keyProperties, value)
          }
        })
      }

      if (checkAllAliases(key, flags.normalize) && !checkAllAliases(key, flags.arrays)) {
        const keys = [key].concat(flags.aliases[key] || [])
        keys.forEach(function (key) {
          Object.defineProperty(argvReturn, key, {
            enumerable: true,
            get () {
              return val
            },
            set (value) {
              val = typeof value === 'string' ? mixin.normalize(value) : value
            }
          })
        })
      }
    }

    function addNewAlias (key: string, alias: string): void {
      key = normalizeKey(key)
      alias = normalizeKey(alias)

      if (!(flags.aliases[key] && flags.aliases[key].length)) {
        flags.aliases[key] = [alias]
        newAliases[alias] = true
      }
      if (!(flags.aliases[alias] && flags.aliases[alias].length)) {
        addNewAlias(alias, key)
      }
    }

    function processValue (key: string, val: any, shouldStripQuotes: boolean) {
      // strings may be quoted, clean this up as we assign values.
      if (shouldStripQuotes) {
        val = stripQuotes(val)
      }

      // handle parsing boolean arguments --foo=true --bar false.
      if (checkAllAliases(key, flags.bools) || checkAllAliases(key, flags.counts)) {
        if (typeof val === 'string') val = val === 'true'
      }

      let value = Array.isArray(val)
        ? val.map(function (v) { return maybeCoerceNumber(key, v) })
        : maybeCoerceNumber(key, val)

      // increment a count given as arg (either no value or value parsed as boolean)
      if (checkAllAliases(key, flags.counts) && (isUndefined(value) || typeof value === 'boolean')) {
        value = increment()
      }

      // Set normalized value when key is in 'normalize' and in 'arrays'
      if (checkAllAliases(key, flags.normalize) && checkAllAliases(key, flags.arrays)) {
        if (Array.isArray(val)) value = val.map((val) => { return mixin.normalize(val) })
        else value = mixin.normalize(val)
      }
      return value
    }

    function maybeCoerceNumber (key: string, value: string | number | null | undefined) {
      if (!configuration['parse-positional-numbers'] && key === '_') return value
      if (!checkAllAliases(key, flags.strings) && !checkAllAliases(key, flags.bools) && !Array.isArray(value)) {
        const shouldCoerceNumber = looksLikeNumber(value) && configuration['parse-numbers'] && (
          Number.isSafeInteger(Math.floor(parseFloat(`${value}`)))
        )
        if (shouldCoerceNumber || (!isUndefined(value) && checkAllAliases(key, flags.numbers))) {
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
      applyDefaultsAndAliases(configLookup, flags.aliases, defaults)

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
        const normalizedFullKey = normalizeKey(fullKey)

        if (typeof value === 'object' && value !== null && !Array.isArray(value) && configuration['dot-notation']) {
          setConfigObject(value, fullKey)
        } else {
          if (!hasKey(argv, keyToSegments(normalizedFullKey)) || (checkAllAliases(normalizedFullKey, flags.arrays) && configuration['combine-arrays'])) {
            setArg(normalizedFullKey, value)
          }
        }
      })
    }

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
          const keys = envVar.split('__').map(function (key, i) {
            if (i === 0) {
              key = key.substring(prefix.length)
            }
            return camelCase(key)
          })
          const normalizedKey = normalizeKey(keys.join('.'))

          if (((configOnly && flags.configs[normalizedKey]) || !configOnly) && !hasKey(argv, keyToSegments(normalizedKey))) {
            setArg(normalizedKey, env[envVar])
          }
        }
      })
    }

    function applyCoercions (argv: Arguments): void {
      let coerce: false | CoerceCallback
      const applied: Set<string> = new Set()
      Object.keys(flags.coercions).forEach(function (key) {
        if (!applied.has(key) && hasKey(argv, keyToSegments(key))) {
          coerce = checkAllAliases(key, flags.coercions)
          if (typeof coerce === 'function') {
            try {
              const value = sanitizeValue(maybeCoerceNumber(key, coerce(getValue(argv, keyToSegments(key)))))
              ;(([] as string[]).concat(flags.aliases[key] || [], key)).forEach(ali => {
                applied.add(ali)
                assignValue(argv, keyToSegments(ali), value)
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
        if (~key.indexOf('.')) return
        if (typeof argv[key] === 'undefined') argv[key] = undefined
      })
      return argv
    }

    function applyDefaultsAndAliases (obj: { [key: string]: any }, aliases: { [key: string]: string[] }, defaults: { [key: string]: any }, canLog: boolean = false): void {
      Object.keys(defaults).forEach(function (key) {
        if (!hasKey(obj, keyToSegments(key))) {
          setKey(obj, keyToSegments(key), defaults[key])
          if (canLog) defaulted[key] = true

          ;(aliases[key] || []).forEach(function (x) {
            if (hasKey(obj, keyToSegments(x))) return
            setKey(obj, keyToSegments(x), defaults[key])
          })
        }
      })
    }

    function hasKey (obj: { [key: string]: any }, keys: string[]): boolean {
      let o: any = obj

      keys = normalizeKeys(keys)

      keys.slice(0, -1).forEach(function (key) {
        if (typeof o !== 'object' || o === null || !Object.prototype.hasOwnProperty.call(o, key)) {
          o = undefined
          return
        }
        o = o[key]
      })

      const key = keys[keys.length - 1]

      if (typeof o !== 'object' || o === null) return false
      return Object.prototype.hasOwnProperty.call(o, key)
    }

    function getValue (obj: { [key: string]: any }, keys: string[]): any {
      let o = obj

      keys = normalizeKeys(keys)
      for (const key of keys) {
        if (typeof o !== 'object' || o === null) return undefined
        o = o[key]
      }

      return o
    }

    function assignValue (obj: { [key: string]: any }, keys: string[], value: any): void {
      let o = obj

      keys = normalizeKeys(keys)
      keys.slice(0, -1).forEach(function (key) {
        if (typeof o[key] !== 'object' || o[key] === null || Array.isArray(o[key])) {
          o[key] = {}
        }
        o = o[key]
      })

      o[keys[keys.length - 1]] = sanitizeValue(value)
    }

    function setKey (obj: { [key: string]: any }, keys: string[], value: any): void {
      let o = obj

      keys = normalizeKeys(keys)
      value = sanitizeValue(value)

      keys.slice(0, -1).forEach(function (key) {
        if (typeof o === 'object' && o[key] === undefined) {
          o[key] = {}
        }

        if (typeof o[key] !== 'object' || o[key] === null || Array.isArray(o[key])) {
          if (Array.isArray(o[key])) {
            o[key].push({})
          } else {
            o[key] = [o[key], {}]
          }

          o = o[key][o[key].length - 1]
        } else {
          o = o[key]
        }
      })

      const key = keys[keys.length - 1]
      const fullKey = keys.join('.')
      const isTypeArray = checkAllAliases(fullKey, flags.arrays)
      const isValueArray = Array.isArray(value)
      let duplicate = configuration['duplicate-arguments-array']
      const nargsCount = checkAllAliases(fullKey, flags.nargs)

      if (!duplicate && nargsCount !== false) {
        duplicate = true
        if ((!isUndefined(o[key]) && nargsCount === 1) || (Array.isArray(o[key]) && o[key].length === nargsCount)) {
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
          checkAllAliases(fullKey, flags.counts) ||
          checkAllAliases(fullKey, flags.bools)
      )) {
        o[key] = [o[key], value]
      } else {
        o[key] = value
      }
    }

    function extendAliases (...args: Array<{ [key: string]: any } | undefined>) {
      args.forEach(function (obj) {
        Object.keys(obj || {}).forEach(function (key) {
          key = normalizeKey(key)

          if (flags.aliases[key]) return

          flags.aliases[key] = ([] as string[]).concat(aliases[key] || [])
          flags.aliases[key].concat(key).forEach(function (x) {
            if (/-/.test(x) && configuration['camel-case-expansion']) {
              const c = normalizeKey(camelCase(x))
              if (c !== key && flags.aliases[key].indexOf(c) === -1) {
                flags.aliases[key].push(c)
                newAliases[c] = true
              }
            }
          })
          flags.aliases[key].concat(key).forEach(function (x) {
            if (x.length > 1 && /[A-Z]/.test(x) && configuration['camel-case-expansion']) {
              const c = normalizeKey(decamelize(x, '-'))
              if (c !== key && flags.aliases[key].indexOf(c) === -1) {
                flags.aliases[key].push(c)
                newAliases[c] = true
              }
            }
          })
          flags.aliases[key].forEach(function (x) {
            flags.aliases[x] = [key].concat(flags.aliases[key].filter(function (y) {
              return x !== y
            }))
          })
        })
      })
    }

    function checkAllAliases (key: string, flag: StringFlag): ValueOf<StringFlag> | false
    function checkAllAliases (key: string, flag: BooleanFlag): ValueOf<BooleanFlag> | false
    function checkAllAliases (key: string, flag: NumberFlag): ValueOf<NumberFlag> | false
    function checkAllAliases (key: string, flag: ConfigsFlag): ValueOf<ConfigsFlag> | false
    function checkAllAliases (key: string, flag: CoercionsFlag): ValueOf<CoercionsFlag> | false
    function checkAllAliases (key: string, flag: Flag): ValueOf<Flag> | false {
      key = normalizeKey(key)
      const toCheck = ([] as string[]).concat(flags.aliases[key] || [], key)
      const keys = Object.keys(flag)
      const setAlias = toCheck.find(key => keys.includes(key))
      return setAlias ? flag[setAlias] : false
    }

    function hasAnyFlag (key: string): boolean {
      key = normalizeKey(key)
      const flagsKeys = Object.keys(flags) as FlagsKey[]
      const toCheck = ([] as Array<{ [key: string]: any } | string[]>).concat(flagsKeys.map(k => flags[k]))
      return toCheck.some(function (flag) {
        return Array.isArray(flag) ? flag.includes(key) : flag[key]
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
      // e.g. '--count=2'
      const flagWithEquals = /^-+([^=]+?)=[\s\S]*$/
      // e.g. '-a' or '--arg'
      const normalFlag = /^-+([^=]+?)$/
      // check the different types of flag styles, including negatedBoolean, a pattern defined near the start of the parse method
      return !hasFlagsMatching(arg, flagWithEquals, negatedBoolean, normalFlag)
    }

    // make a best effort to pick a default value
    // for an option based on name and type.
    function defaultValue (key: string) {
      key = normalizeKey(key)
      if (!checkAllAliases(key, flags.bools) &&
          !checkAllAliases(key, flags.counts) &&
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
      if (checkAllAliases(key, flags.strings)) type = DefaultValuesForTypeKey.STRING
      else if (checkAllAliases(key, flags.numbers)) type = DefaultValuesForTypeKey.NUMBER
      else if (checkAllAliases(key, flags.bools)) type = DefaultValuesForTypeKey.BOOLEAN
      else if (checkAllAliases(key, flags.arrays)) type = DefaultValuesForTypeKey.ARRAY
      return type
    }

    function isUndefined (num: any): num is undefined {
      return num === undefined
    }

    // check user configuration settings for inconsistencies
    function checkConfiguration (): void {
      // count keys should not be set as array/narg
      Object.keys(flags.counts).find(key => {
        if (checkAllAliases(key, flags.arrays)) {
          error = Error(__('Invalid configuration: %s, opts.count excludes opts.array.', key))
          return true
        } else if (checkAllAliases(key, flags.nargs)) {
          error = Error(__('Invalid configuration: %s, opts.count excludes opts.narg.', key))
          return true
        }
        return false
      })
    }

    return {
      aliases: copyDictionary(flags.aliases),
      argv: Object.assign(argvReturn, argv),
      configuration: configuration,
      defaulted: copyDictionary(defaulted),
      error: error,
      newAliases: copyDictionary(newAliases)
    }
  }
}

// if any aliases reference each other, we should
// merge them together.
function combineAliases (aliases: Dictionary<string | string[]>): Dictionary<string[]> {
  const aliasArrays: Array<string[]> = []
  const combined: Dictionary<string[]> = Object.create(null)
  let change = true

  // turn alias lookup hash {key: ['alias1', 'alias2']} into
  // a simple array ['key', 'alias1', 'alias2']
  Object.keys(aliases).forEach(function (key) {
    aliasArrays.push(
      ([] as string[]).concat(aliases[key], key)
    )
  })

  // combine arrays until zero changes are
  // made in an iteration.
  while (change) {
    change = false
    for (let i = 0; i < aliasArrays.length; i++) {
      for (let ii = i + 1; ii < aliasArrays.length; ii++) {
        const intersect = aliasArrays[i].filter(function (v) {
          return aliasArrays[ii].indexOf(v) !== -1
        })

        if (intersect.length) {
          aliasArrays[i] = aliasArrays[i].concat(aliasArrays[ii])
          aliasArrays.splice(ii, 1)
          change = true
          break
        }
      }
    }
  }

  // map arrays back to the hash-lookup (de-dupe while
  // we're at it).
  aliasArrays.forEach(function (aliasArray) {
    aliasArray = aliasArray.filter(function (v, i, self) {
      return self.indexOf(v) === i
    })
    const lastAlias = aliasArray.pop()
    if (lastAlias !== undefined && typeof lastAlias === 'string') {
      combined[lastAlias] = aliasArray
    }
  })

  return combined
}

// this function should only be called when a count is given as an arg
// it is NOT called to set a default value
// thus we can start the count at 1 instead of 0
function increment (orig?: number | undefined): number {
  return orig !== undefined ? orig + 1 : 1
}

function copyDictionary<T> (input: Dictionary<T>): Dictionary<T> {
  const copied: Dictionary<T> = {}
  Object.keys(input).forEach(key => {
    copied[sanitizeKey(key)] = input[key]
  })
  return copied
}

function normalizeKeysForConfig (keys: string[], dotNotation: boolean): string[] {
  return dotNotation ? keys.map(key => sanitizeKey(key)) : [sanitizeKey(keys.join('.'))]
}

function keyToSegmentsForConfig (key: string, dotNotation: boolean): string[] {
  return normalizeKeysForConfig(dotNotation ? key.split('.') : [key], dotNotation)
}

function normalizeKeyForConfig (key: string, dotNotation: boolean): string {
  return keyToSegmentsForConfig(key, dotNotation).join('.')
}

function sanitizeValue (value: any): any {
  if (Array.isArray(value)) {
    return value.map(item => sanitizeValue(item))
  }

  if (typeof value === 'object' && value !== null) {
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) {
      return value
    }

    const sanitized: { [key: string]: any } = {}
    Object.keys(value).forEach(key => {
      sanitized[sanitizeKey(key)] = sanitizeValue(value[key])
    })
    return sanitized
  }

  return value
}

function sanitizeKey (key: string): string {
  if (key === '__proto__') return '___proto___'
  if (key === 'constructor') return '___constructor___'
  if (key === 'prototype') return '___prototype___'
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

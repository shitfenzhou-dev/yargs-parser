/**
 * @license
 * Copyright (c) 2016, Contributors
 * SPDX-License-Identifier: ISC
 */

import type { Dictionary, StringFlag } from './yargs-parser-types.js'
import { camelCase, decamelize } from './string-utils.js'

export class AliasHelper {
  private aliases: StringFlag
  private newAliases: Dictionary<boolean>
  private configuration: {
    'camel-case-expansion': boolean
  }

  constructor (
    combinedAliases: Dictionary<string[]>,
    configuration: { 'camel-case-expansion': boolean },
    newAliases: Dictionary<boolean> = Object.create(null)
  ) {
    this.aliases = Object.create(null)
    this.newAliases = newAliases
    this.configuration = configuration
    Object.assign(this.aliases, combinedAliases)
  }

  static combineAliases (inputAliases: Dictionary<string | string[]>): Dictionary<string[]> {
    const aliasArrays: Array<string[]> = []
    const combined: Dictionary<string[]> = Object.create(null)
    let change = true

    Object.keys(inputAliases).forEach(function (key) {
      aliasArrays.push(
        ([] as string[]).concat(inputAliases[key], key)
      )
    })

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

  getAliases (): StringFlag {
    return this.aliases
  }

  getNewAliases (): Dictionary<boolean> {
    return this.newAliases
  }

  getAllAliasesForKey (key: string): string[] {
    return ([] as string[]).concat(this.aliases[key] || [], key)
  }

  hasAliasForKey (key: string): boolean {
    return !!this.aliases[key] && this.aliases[key].length > 0
  }

  getAliasesOfKey (key: string): string[] {
    return this.aliases[key] || []
  }

  addAlias (key: string, alias: string): void {
    if (!(this.aliases[key] && this.aliases[key].length)) {
      if (!this.aliases[key]) {
        this.aliases[key] = []
      }
      if (!this.aliases[key].includes(alias)) {
        this.aliases[key].push(alias)
        this.newAliases[alias] = true
      }
    }
    if (!(this.aliases[alias] && this.aliases[alias].length)) {
      this.addAlias(alias, key)
    }
  }

  extendAliases (objects: Array<{ [key: string]: any } | undefined>): void {
    objects.forEach(obj => {
      Object.keys(obj || {}).forEach(key => {
        if (this.aliases[key]) return

        this.aliases[key] = ([] as string[]).concat(this.aliases[key] || [])

        this.extendCamelCaseAliases(key)
        this.extendDecamelizeAliases(key)

        this.aliases[key].forEach(x => {
          this.aliases[x] = [key].concat(this.aliases[key].filter(y => {
            return x !== y
          }))
        })
      })
    })
  }

  private extendCamelCaseAliases (key: string): void {
    if (!this.configuration['camel-case-expansion']) return

    this.aliases[key].concat(key).forEach(x => {
      if (/-/.test(x)) {
        const c = this.camelCaseForDot(x)
        if (c !== key && !this.aliases[key].includes(c)) {
          this.aliases[key].push(c)
          this.newAliases[c] = true
        }
      }
    })
  }

  private extendDecamelizeAliases (key: string): void {
    if (!this.configuration['camel-case-expansion']) return

    this.aliases[key].concat(key).forEach(x => {
      if (x.length > 1 && /[A-Z]/.test(x)) {
        const c = decamelize(x, '-')
        if (c !== key && !this.aliases[key].includes(c)) {
          this.aliases[key].push(c)
          this.newAliases[c] = true
        }
      }
    })
  }

  private camelCaseForDot (str: string): string {
    return str.split('.').map(function (prop) {
      return camelCase(prop)
    }).join('.')
  }

  addCamelCaseAliasIfNeeded (key: string): void {
    if (/-/.test(key) && this.configuration['camel-case-expansion']) {
      const alias = this.camelCaseForDot(key)
      this.addAlias(key, alias)
    }
  }

  checkAllAliases (key: string, flag: { [key: string]: any }): any | false {
    const toCheck = this.getAllAliasesForKey(key)
    const keys = Object.keys(flag)
    const setAlias = toCheck.find(k => keys.includes(k))
    return setAlias ? flag[setAlias] : false
  }

  forEachAlias (key: string, callback: (alias: string) => void): void {
    ;(this.aliases[key] || []).forEach(callback)
  }

  forEachAllKey (key: string, callback: (key: string) => void): void {
    this.getAllAliasesForKey(key).forEach(callback)
  }

  expandDotNotationAliases (splitKey: string[], callback: (aliasKey: string[]) => void): void {
    if (splitKey.length > 1) {
      ;(this.aliases[splitKey[0]] || []).forEach(x => {
        let aliasKey = x.split('.')
        const a = ([] as string[]).concat(splitKey)
        a.shift()
        aliasKey = aliasKey.concat(a)
        callback(aliasKey)
      })
    }
  }

  applyDefaultsToAliases (defaults: Dictionary<any>): void {
    Object.keys(defaults).forEach(key => {
      this.forEachAlias(key, alias => {
        if (defaults[alias] === undefined) {
          defaults[alias] = defaults[key]
        }
      })
    })
  }

  collectAllAliasKeys (): string[] {
    return ([] as string[]).concat(...Object.keys(this.aliases).map(k => this.aliases[k]))
  }

  camelCaseForStrip (key: string): string {
    return key.split('.').map(prop => camelCase(prop)).join('.')
  }
}

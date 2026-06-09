import type { Dictionary, Configuration, Flag } from './yargs-parser-types.js'
import { camelCase, decamelize } from './string-utils.js'

export class AliasManager {
  aliases: Dictionary<string[]> = Object.create(null)
  flagsAliases: Dictionary<string[]> = Object.create(null)
  newAliases: Dictionary<boolean> = Object.create(null)
  configuration: Configuration

  constructor(userAliases: Dictionary<string | string[]>, configuration: Configuration) {
    this.configuration = configuration
    this.aliases = this.combineAliases(Object.assign(Object.create(null), userAliases))
  }

  private combineAliases(aliases: Dictionary<string | string[]>): Dictionary<string[]> {
    const aliasArrays: Array<string[]> = []
    const combined: Dictionary<string[]> = Object.create(null)
    let change = true

    Object.keys(aliases).forEach(function (key) {
      aliasArrays.push(([] as string[]).concat(aliases[key], key))
    })

    while (change) {
      change = false
      for (let i = 0; i < aliasArrays.length; i++) {
        for (let ii = i + 1; ii < aliasArrays.length; ii++) {
          const intersect = aliasArrays[i].filter(v => aliasArrays[ii].indexOf(v) !== -1)
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
      aliasArray = aliasArray.filter((v, i, self) => self.indexOf(v) === i)
      const lastAlias = aliasArray.pop()
      if (lastAlias !== undefined && typeof lastAlias === 'string') {
        combined[lastAlias] = aliasArray
      }
    })

    return combined
  }

  extendAliases(...args: Array<{ [key: string]: any } | undefined>): void {
    args.forEach(obj => {
      Object.keys(obj || {}).forEach(key => {
        if (this.flagsAliases[key]) return

        this.flagsAliases[key] = ([] as string[]).concat(this.aliases[key] || [])
        
        this.flagsAliases[key].concat(key).forEach(x => {
          if (/-/.test(x) && this.configuration['camel-case-expansion']) {
            const c = camelCase(x)
            if (c !== key && this.flagsAliases[key].indexOf(c) === -1) {
              this.flagsAliases[key].push(c)
              this.newAliases[c] = true
            }
          }
        })
        
        this.flagsAliases[key].concat(key).forEach(x => {
          if (x.length > 1 && /[A-Z]/.test(x) && this.configuration['camel-case-expansion']) {
            const c = decamelize(x, '-')
            if (c !== key && this.flagsAliases[key].indexOf(c) === -1) {
              this.flagsAliases[key].push(c)
              this.newAliases[c] = true
            }
          }
        })
        
        this.flagsAliases[key].forEach(x => {
          this.flagsAliases[x] = [key].concat(this.flagsAliases[key].filter(y => x !== y))
        })
      })
    })
  }

  addNewAlias(key: string, alias: string): void {
    if (!(this.flagsAliases[key] && this.flagsAliases[key].length)) {
      this.flagsAliases[key] = [alias]
      this.newAliases[alias] = true
    }
    if (!(this.flagsAliases[alias] && this.flagsAliases[alias].length)) {
      this.addNewAlias(alias, key)
    }
  }

  checkAllAliases<T>(key: string, flag: Dictionary<T>): T | false {
    const toCheck = ([] as string[]).concat(this.flagsAliases[key] || [], key)
    const keys = Object.keys(flag)
    const setAlias = toCheck.find(k => keys.includes(k))
    return setAlias ? flag[setAlias] : false
  }
}

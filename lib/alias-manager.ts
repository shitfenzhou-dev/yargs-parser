/**
 * @license
 * Copyright (c) 2016, Contributors
 * SPDX-License-Identifier: ISC
 */

/**
 * AliasManager: a single source of truth for alias bookkeeping.
 *
 * Centralizes responsibilities previously scattered across
 * combineAliases / extendAliases / addNewAlias / checkAllAliases /
 * setArg alias propagation / applyDefaultsAndAliases / strip-aliased.
 *
 * State model:
 *   - `groups`: one shared "equivalence group" per set of keys that
 *     are aliases of each other. Aliasing is bidirectional and
 *     transitive. { foo: ['bar'], bar: ['c'] } becomes a single
 *     group {foo, bar, c}.
 *   - `aliases[key]`: for each key, the list of *other* keys that
 *     are aliases of it (never includes key itself). This is the
 *     shape returned to callers so existing semantics are preserved.
 *   - `newAliases[key]`: keys that were *inferred* (either via
 *     camel-case expansion or implicitly via addPair) as opposed to
 *     being explicitly supplied by the caller via `alias:`.
 *   - `explicitKeys`: the keys that appeared in the caller-supplied
 *     `alias: {...}` map. Used by the `strip-aliased` feature to
 *     know which aliases correspond to user-declared aliases.
 */

import { camelCase, decamelize } from './string-utils.js'

export interface Dictionary<T> {
  [key: string]: T
}

export interface AliasManagerOptions {
  camelCaseExpansion?: boolean
}

export class AliasManager {
  private groups: Dictionary<Set<string>> = Object.create(null)
  private aliases: Dictionary<string[]> = Object.create(null)
  private newAliases: Dictionary<boolean> = Object.create(null)
  private explicitKeyToGroup: Dictionary<boolean> = Object.create(null)
  private camelCaseExpansion: boolean

  constructor (opts?: AliasManagerOptions) {
    this.camelCaseExpansion = Boolean(opts && opts.camelCaseExpansion)
  }

  /**
   * Normalize the user-supplied `alias: { key: [alias1, alias2] }`
   * map into our internal groups. Mirrors `combineAliases` from
   * the original implementation.
   */
  initializeFromUserConfig (userAliases: Dictionary<string | string[]>): void {
    const rawGroups: Array<string[]> = []
    Object.keys(userAliases).forEach(function (key) {
      rawGroups.push(
        ([] as string[]).concat(userAliases[key], key)
      )
    })

    // keep merging groups while they share any member.
    let changed = true
    while (changed) {
      changed = false
      for (let i = 0; i < rawGroups.length; i++) {
        for (let ii = i + 1; ii < rawGroups.length; ii++) {
          const intersects = rawGroups[i].some(function (v) {
            return rawGroups[ii].indexOf(v) !== -1
          })
          if (intersects) {
            rawGroups[i] = rawGroups[i].concat(rawGroups[ii])
            rawGroups.splice(ii, 1)
            changed = true
            break
          }
        }
      }
    }

    rawGroups.forEach((rawGroup) => {
      // de-dupe.
      const seen: string[] = []
      rawGroup.forEach(function (v) {
        if (seen.indexOf(v) === -1) seen.push(v)
      })
      if (!seen.length) return
      const groupId = seen[0]
      const group = new Set<string>()
      seen.forEach((member) => {
        this.explicitKeyToGroup[member] = true
        group.add(member)
      })
      seen.forEach((member) => {
        this.groups[member] = group
      })
    })

    this.rebuildAliasIndex()
  }

  /**
   * Register bidirectional aliases between two keys. Mirrors the
   * recursive `addNewAlias(key, alias)` function used for inferred
   * camel-case pairs.
   */
  addPair (key: string, alias: string, markAsNew: boolean = true): void {
    if (key === alias) return

    const gKey = this.groups[key]
    const gAlias = this.groups[alias]

    if (gKey && gAlias && gKey === gAlias) return // already same group.

    if (gKey && gAlias) {
      gAlias.forEach((member) => {
        gKey.add(member)
        this.groups[member] = gKey
      })
    } else if (gKey) {
      gKey.add(alias)
      this.groups[alias] = gKey
    } else if (gAlias) {
      gAlias.add(key)
      this.groups[key] = gAlias
    } else {
      const newGroup = new Set<string>([key, alias])
      this.groups[key] = newGroup
      this.groups[alias] = newGroup
    }

    if (markAsNew) {
      this.newAliases[alias] = true
      // the original addNewAlias was recursive; the reverse pair
      // (`alias` → `key`) was also considered new if not already set.
      if (!this.hasAnyAlias(key)) this.newAliases[key] = true
    }

    this.rebuildAliasIndex()
  }

  /**
   * Given a set of key-containers (opts.key, opts.default, opts.array,
   * etc.), ensure each key has its group registered. Additionally
   * infers camel-case / dashed-case pairs when the configuration
   * allows. Mirrors `extendAliases`.
   */
  extend (keySources: Array<Dictionary<any> | undefined>): void {
    keySources.forEach((source) => {
      Object.keys(source || {}).forEach((key) => {
        // already has an explicit or extended group → leave alone.
        if (this.hasAnyAlias(key)) return

        // seed the group with the key itself (solo for now).
        if (!this.groups[key]) {
          const solo = new Set<string>([key])
          this.groups[key] = solo
        }

        if (this.camelCaseExpansion) {
          // add camelCase / dashed variants for every current member
          // of the group. (We iterate over a snapshot.)
          const currentMembers = Array.from(this.groups[key])
          currentMembers.forEach((member) => {
            // dashed → camelCase
            if (/-/.test(member)) {
              const c = camelCase(member)
              if (c !== key) this.addPair(key, c, true)
            }
            // camelCase → dashed
            if (member.length > 1 && /[A-Z]/.test(member)) {
              const c = decamelize(member, '-')
              if (c !== key) this.addPair(key, c, true)
            }
          })
        }
      })
    })
  }

  /**
   * Return true if key is known to the alias manager.
   */
  isKnown (key: string): boolean {
    return !!this.groups[key]
  }

  /**
   * Return true if key has at least one alias.
   */
  hasAnyAlias (key: string): boolean {
    return !!this.aliases[key] && this.aliases[key].length > 0
  }

  /**
   * Return the list of *other* keys that are aliases of `key`.
   * (Matches `flags.aliases[key]` semantics: never includes `key`.)
   */
  getAliases (key: string): string[] {
    return this.aliases[key] ? this.aliases[key].slice() : []
  }

  /**
   * Iterate `[key].concat(aliases)` (order preserved). Mirrors the
   * `toCheck` pattern used inside `checkAllAliases`.
   */
  forEachMember (key: string, fn: (member: string) => void): void {
    fn(key)
    const aliases = this.aliases[key]
    if (aliases) aliases.forEach(fn)
  }

  /**
   * Return the first truthy value found in `flag` keyed by any
   * member of `key`'s group. Mirrors `checkAllAliases`.
   */
  checkAny<T> (key: string, flag: Dictionary<T>): T | false {
    const flagKeys = Object.keys(flag)
    const group = this.groups[key]
    if (group) {
      // iterate in canonical order: self first, then other aliases
      // (to preserve any prior "which key wins" behavior for
      // duplicate flags).
      if (flagKeys.includes(key) && flag[key]) return flag[key]
      const aliasList = this.aliases[key]
      if (aliasList) {
        for (let i = 0; i < aliasList.length; i++) {
          if (flagKeys.includes(aliasList[i]) && flag[aliasList[i]]) {
            return flag[aliasList[i]]
          }
        }
      }
      return false
    }
    // unknown key → fall back to checking the key itself
    if (flagKeys.includes(key)) return flag[key]
    return false
  }

  /**
   * Given a default value for `key`, also propagate it to every
   * alias of `key` in the provided defaults object. Mirrors the
   * "apply default values to all aliases" loop in `parse()`.
   */
  propagateDefaultsToAliases (defaults: Dictionary<any>): void {
    Object.keys(defaults).forEach((key) => {
      const aliasList = this.aliases[key]
      if (!aliasList) return
      aliasList.forEach((alias) => {
        if (defaults[alias] === undefined) {
          defaults[alias] = defaults[key]
        }
      })
    })
  }

  /**
   * Write a value to `obj` at `key`'s path and to the paths of all
   * of `key`'s aliases (including dot-notation derived aliases).
   * This replaces the alias-population logic formerly inside
   * `setArg`.
   *
   * `setKey(obj, keys, value)` is the low-level setter that honors
   * the caller's dot-notation configuration.
   */
  writeValueWithAliases (
    key: string,
    value: any,
    obj: any,
    setKey: (obj: any, keys: string[], value: any) => void,
    dotNotationEnabled: boolean
  ): void {
    const splitKey = key.split('.')
    setKey(obj, splitKey, value)

    // aliases of the full key.
    const directAliases = this.aliases[key]
    if (directAliases && directAliases.length) {
      directAliases.forEach((alias) => {
        setKey(obj, alias.split('.'), value)
      })
    }

    // aliases of the first element of a dot-notation key.
    if (splitKey.length > 1 && dotNotationEnabled) {
      const firstElAliases = this.aliases[splitKey[0]]
      if (firstElAliases && firstElAliases.length) {
        firstElAliases.forEach((alias) => {
          const aliasKeys = alias.split('.').concat(splitKey.slice(1))
          // skip keys that are already covered as direct aliases of
          // the full key above.
          if (directAliases && directAliases.indexOf(aliasKeys.join('.')) !== -1) return
          setKey(obj, aliasKeys, value)
        })
      }
    }
  }

  /**
   * Apply default values (from the user's `default:` map) to the
   * target object and its aliases. Mirrors `applyDefaultsAndAliases`.
   */
  applyDefaultsAndAliases (
    obj: any,
    defaults: Dictionary<any>,
    setKey: (obj: any, keys: string[], value: any) => void,
    hasKey: (obj: any, keys: string[]) => boolean,
    markDefaulted: ((key: string) => void) | undefined
  ): void {
    Object.keys(defaults).forEach((key) => {
      if (!hasKey(obj, key.split('.'))) {
        setKey(obj, key.split('.'), defaults[key])
        if (markDefaulted) markDefaulted(key)

        const aliasList = this.aliases[key]
        if (aliasList) {
          aliasList.forEach((alias) => {
            if (hasKey(obj, alias.split('.'))) return
            setKey(obj, alias.split('.'), defaults[key])
          })
        }
      }
    })
  }

  /**
   * Return the list of aliases that correspond to user-supplied
   * `alias:` entries (i.e., not inferred via camel-case expansion).
   * Used by the `strip-aliased` configuration option.
   */
  getExplicitAliases (): string[] {
    const out: string[] = []
    Object.keys(this.explicitKeyToGroup).forEach((key) => {
      const aliasList = this.aliases[key]
      if (aliasList) {
        aliasList.forEach((alias) => {
          if (out.indexOf(alias) === -1) out.push(alias)
        })
      }
    })
    return out
  }

  /**
   * Snapshot of `flags.aliases` to return to the caller.
   */
  snapshotAliases (): Dictionary<string[]> {
    const out: Dictionary<string[]> = Object.create(null)
    Object.keys(this.aliases).forEach((key) => {
      out[key] = this.aliases[key].slice()
    })
    return out
  }

  /**
   * Snapshot of `newAliases` to return to the caller.
   */
  snapshotNewAliases (): Dictionary<boolean> {
    const out: Dictionary<boolean> = Object.create(null)
    Object.keys(this.newAliases).forEach((key) => {
      out[key] = this.newAliases[key]
    })
    return out
  }

  private rebuildAliasIndex (): void {
    const seenGroups = new Set<Set<string>>()
    Object.keys(this.groups).forEach((key) => {
      const group = this.groups[key]
      if (!group || seenGroups.has(group)) return
      seenGroups.add(group)
    })

    // We rebuild per-key to ensure stable order.
    this.aliases = Object.create(null)
    Object.keys(this.groups).forEach((key) => {
      const group = this.groups[key]
      if (!group) return
      const others: string[] = []
      group.forEach((member) => {
        if (member !== key) others.push(member)
      })
      this.aliases[key] = others
    })
  }
}

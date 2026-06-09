/**
 * @license
 * Copyright (c) 2016, Contributors
 * SPDX-License-Identifier: ISC
 */

export function camelCase (str: string): string {
  // Handle the case where an argument is provided as camel case, e.g., fooBar.
  // by ensuring that the string isn't already mixed case:
  const isCamelCase = str !== str.toLowerCase() && str !== str.toUpperCase()

  if (!isCamelCase) {
    str = str.toLowerCase()
  }

  if (str.indexOf('-') === -1 && str.indexOf('_') === -1) {
    return str
  } else {
    let camelcase = ''
    let nextChrUpper = false
    const leadingHyphens = str.match(/^-+/)
    for (let i = leadingHyphens ? leadingHyphens[0].length : 0; i < str.length; i++) {
      let chr = str.charAt(i)
      if (nextChrUpper) {
        nextChrUpper = false
        chr = chr.toUpperCase()
      }
      if (i !== 0 && (chr === '-' || chr === '_')) {
        nextChrUpper = true
      } else if (chr !== '-' && chr !== '_') {
        camelcase += chr
      }
    }
    return camelcase
  }
}

export function decamelize (str: string, joinString?: string): string {
  const lowercase = str.toLowerCase()
  joinString = joinString || '-'
  let notCamelcase = ''
  for (let i = 0; i < str.length; i++) {
    const chrLower = lowercase.charAt(i)
    const chrString = str.charAt(i)
    if (chrLower !== chrString && i > 0) {
      notCamelcase += `${joinString}${lowercase.charAt(i)}`
    } else {
      notCamelcase += chrString
    }
  }
  return notCamelcase
}

export function looksLikeNumber (x: null | undefined | number | string): boolean {
  if (x === null || x === undefined) return false
  // if loaded from config, may already be a number.
  if (typeof x === 'number') return true
  // hexadecimal.
  if (/^0x[0-9a-f]+$/i.test(x)) return true
  // don't treat 0123 as a number; as it drops the leading '0'.
  if (/^0[^.]/.test(x)) return false
  return /^[-]?(?:\d+(?:\.\d*)?|\.\d+)(e[-+]?\d+)?$/.test(x)
}

export function looksLikeSafeInteger (x: null | undefined | number | string): boolean {
  if (x === null || x === undefined) return false
  // don't treat 0123 as an integer; keep leading zero protection.
  if (typeof x === 'string' && /^0[^.]/.test(x)) return false
  if (typeof x === 'string' && /^00[^.]?/.test(x)) return false
  // hexadecimal.
  if (typeof x === 'string' && /^-?0x[0-9a-f]+$/i.test(x)) {
    const n = parseInt(x, 16)
    return Number.isSafeInteger(n)
  }
  // require a plain integer or an integer-valued scientific notation, e.g. "1e3" = 1000.
  // reject decimals like "3.14" or "1.5e2" or non-digit tails like "abc" or "1e".
  if (typeof x === 'string') {
    const plainInteger = /^-?\d+$/
    const integerScientific = /^-?\d+e[+-]?\d+$/i
    if (!plainInteger.test(x) && !integerScientific.test(x)) return false
  }
  const n = typeof x === 'number' ? x : Number(x)
  if (!Number.isFinite(n)) return false
  if (!Number.isSafeInteger(n)) return false
  if (typeof x === 'string') {
    // ensure the string actually represents the integer we computed.
    // this rejects things like "3.14" (already rejected by regex) or "abc".
    if (!Number.isSafeInteger(Number(x))) return false
  }
  return true
}

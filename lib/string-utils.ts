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

export interface IntegerParseResult {
  value: number | null
  error: string | null
}

export function parseInteger (x: null | undefined | number | string): IntegerParseResult {
  if (x === null || x === undefined) {
    return { value: null, error: 'Expected an integer, received null or undefined' }
  }
  if (typeof x === 'number') {
    if (!Number.isInteger(x)) {
      return { value: null, error: `Expected an integer, received ${x}` }
    }
    if (!Number.isSafeInteger(x)) {
      return { value: null, error: `Integer ${x} exceeds safe integer range` }
    }
    return { value: x, error: null }
  }
  if (typeof x !== 'string') {
    return { value: null, error: `Expected an integer, received ${typeof x}` }
  }
  const str = x.trim()
  if (str === '') {
    return { value: null, error: 'Expected an integer, received empty string' }
  }
  if (/^0[^.]/.test(str)) {
    return { value: null, error: `Invalid integer with leading zero: "${str}"` }
  }
  if (/^[-+]?\d+$/.test(str)) {
    const num = Number(str)
    if (!Number.isSafeInteger(num)) {
      return { value: null, error: `Integer ${str} exceeds safe integer range` }
    }
    return { value: num, error: null }
  }
  if (/^0x[0-9a-f]+$/i.test(str)) {
    const num = Number(str)
    if (!Number.isSafeInteger(num)) {
      return { value: null, error: `Integer ${str} exceeds safe integer range` }
    }
    return { value: num, error: null }
  }
  if (/^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(e[-+]?\d+)?$/i.test(str)) {
    const num = Number(str)
    if (!Number.isFinite(num)) {
      return { value: null, error: `Integer ${str} exceeds safe integer range` }
    }
    if (!Number.isInteger(num)) {
      return { value: null, error: `Expected an integer, received ${str}` }
    }
    if (!Number.isSafeInteger(num)) {
      return { value: null, error: `Integer ${str} exceeds safe integer range` }
    }
    return { value: num, error: null }
  }
  return { value: null, error: `Expected an integer, received "${str}"` }
}

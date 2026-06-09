/**
 * @license
 * Copyright (c) 2016, Contributors
 * SPDX-License-Identifier: ISC
 */

// take an un-split argv string and tokenize it.
export function tokenizeArgString (argString: string | any[]): string[] {
  if (Array.isArray(argString)) {
    return argString.map(e => typeof e !== 'string' ? e + '' : e)
  }

  argString = argString.trim()

  let i = 0
  let prevC: string | null = null
  let c: string | null = null
  let opening: string | null = null
  const args: string[] = []

  for (let ii = 0; ii < argString.length; ii++) {
    prevC = c
    c = argString.charAt(ii)

    if (c === '\\' && ii + 1 < argString.length) {
      const nextC = argString.charAt(ii + 1)

      if (nextC === '\\') {
        if (!args[i]) args[i] = ''
        args[i] += '\\'
        ii++
        c = '\\'
        continue
      }

      if (opening) {
        if (nextC === opening) {
          if (!args[i]) args[i] = ''
          args[i] += nextC
          ii++
          c = nextC
          continue
        }
        if (!args[i]) args[i] = ''
        args[i] += c
        continue
      }

      if (nextC === ' ' || nextC === '\t') {
        if (!args[i]) args[i] = ''
        args[i] += nextC
        ii++
        c = nextC
        continue
      }

      if (nextC === '"' || nextC === "'") {
        if (!args[i]) args[i] = ''
        args[i] += nextC
        ii++
        c = nextC
        continue
      }

      if (!args[i]) args[i] = ''
      args[i] += c
      continue
    }

    // split on spaces unless we're in quotes.
    if (c === ' ' && !opening) {
      if (!(prevC === ' ')) {
        i++
      }
      continue
    }

    // don't split the string if we're in matching
    // opening or closing single and double quotes.
    if (c === opening) {
      opening = null
    } else if ((c === "'" || c === '"') && !opening) {
      opening = c
    }

    if (!args[i]) args[i] = ''
    args[i] += c
  }

  return args
}

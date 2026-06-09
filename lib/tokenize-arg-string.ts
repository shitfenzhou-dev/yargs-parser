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

    // Handle backslash escape sequences.
    if (c === '\\' && ii + 1 < argString.length) {
      const nextC = argString.charAt(ii + 1)
      // Escaped backslash, escaped quotes (inside or outside quotes),
      // and escaped whitespace (outside quotes only).
      if (nextC === '\\' || nextC === "'" || nextC === '"' || (!opening && nextC === ' ')) {
        ii++
        c = argString.charAt(ii)
        if (!args[i]) args[i] = ''
        args[i] += c
        prevC = c
        continue
      }
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

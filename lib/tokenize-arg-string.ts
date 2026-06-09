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
  let c: string | null = null
  let opening: string | null = null
  let escapeNext = false
  // Track whether the previous character was a token-splitting whitespace,
  // so consecutive unescaped/unquoted whitespace collapses into one split.
  let prevWasSplittingSpace = false
  const args: string[] = []

  for (let ii = 0; ii < argString.length; ii++) {
    c = argString.charAt(ii)

    // A backslash escapes the next character. When escaped, that next
    // character is appended literally to the current token without
    // triggering whitespace splitting or quote state changes.
    if (c === '\\' && !escapeNext) {
      escapeNext = true
      if (!args[i]) args[i] = ''
      args[i] += c
      prevWasSplittingSpace = false
      continue
    }

    // When the previous char was a backslash, the current character is
    // escaped: append verbatim and reset flag. An escaped whitespace is
    // kept within the same token (no splitting).
    if (escapeNext) {
      escapeNext = false
      if (!args[i]) args[i] = ''
      args[i] += c
      prevWasSplittingSpace = false
      continue
    }

    // split on spaces unless we're in quotes.
    if (c === ' ' && !opening) {
      if (!prevWasSplittingSpace) {
        i++
      }
      prevWasSplittingSpace = true
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
    prevWasSplittingSpace = false
  }

  return args
}

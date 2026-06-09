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
  let opening: string | null = null
  let escaping = false
  const args: string[] = []

  for (let ii = 0; ii < argString.length; ii++) {
    const c = argString.charAt(ii)

    if (escaping) {
      if (!args[i]) args[i] = ''
      args[i] += c
      escaping = false
      continue
    }

    if (c === '\\' && shouldEscapeCharacter(argString.charAt(ii + 1), opening)) {
      if (!args[i]) args[i] = ''
      escaping = true
      continue
    }

    // split on whitespace unless we're in quotes.
    if (/\s/.test(c) && !opening) {
      if (args[i]) {
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

function shouldEscapeCharacter (character: string, opening: string | null): boolean {
  if (!character) {
    return false
  }

  if (character === '\\' || character === '"' || character === "'") {
    return true
  }

  return !opening && /\s/.test(character)
}

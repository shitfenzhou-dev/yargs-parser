import { Dictionary } from './yargs-parser-types.js'
import { camelCase, decamelize } from './string-utils.js'

export class AliasManager {
  aliases: Dictionary<string[]> = Object.create(null)
  newAliases: Dictionary<boolean> = Object.create(null)
  
  // we can move methods here
}

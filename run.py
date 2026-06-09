import re

with open('lib/yargs-parser.ts', 'r') as f:
    code = f.read()

# Add import
code = code.replace(
    "import { camelCase, decamelize, looksLikeNumber } from './string-utils.js'",
    "import { camelCase, decamelize, looksLikeNumber } from './string-utils.js'\nimport { AliasManager } from './alias.js'"
)

# 1. configuration
old_config = """    // aliases might have transitive relationships, normalize this.
    const aliases = combineAliases(Object.assign(Object.create(null), opts.alias))
    const configuration: Configuration = Object.assign({
      'boolean-negation': true,
      'camel-case-expansion': true,
      'combine-arrays': false,
      'dot-notation': true,
      'duplicate-arguments-array': true,
      'flatten-duplicate-arrays': true,
      'greedy-arrays': true,
      'halt-at-non-option': false,
      'nargs-eats-options': false,
      'negation-prefix': 'no-',
      'parse-numbers': true,
      'parse-positional-numbers': true,
      'populate--': false,
      'set-placeholder-key': false,
      'short-option-groups': true,
      'strip-aliased': false,
      'strip-dashed': false,
      'unknown-options-as-args': false
    }, opts.configuration)"""

new_config = """    const configuration: Configuration = Object.assign({
      'boolean-negation': true,
      'camel-case-expansion': true,
      'combine-arrays': false,
      'dot-notation': true,
      'duplicate-arguments-array': true,
      'flatten-duplicate-arrays': true,
      'greedy-arrays': true,
      'halt-at-non-option': false,
      'nargs-eats-options': false,
      'negation-prefix': 'no-',
      'parse-numbers': true,
      'parse-positional-numbers': true,
      'populate--': false,
      'set-placeholder-key': false,
      'short-option-groups': true,
      'strip-aliased': false,
      'strip-dashed': false,
      'unknown-options-as-args': false
    }, opts.configuration)
    const aliasManager = new AliasManager(opts.alias || {}, configuration)
    const aliases = aliasManager.aliases"""

code = code.replace(old_config, new_config)

code = code.replace("    const newAliases: Dictionary<boolean> = Object.create(null)\n", "")
code = code.replace("      aliases: Object.create(null),", "      aliases: aliasManager.flagsAliases,")

# 2. extendAliases
code = code.replace(
    "extendAliases(opts.key, aliases, opts.default, flags.arrays)",
    "aliasManager.extendAliases(opts.key, opts.default, flags.arrays)"
)

# 3. newAliases
code = code.replace(
    "newAliases: Object.assign({}, newAliases)",
    "newAliases: Object.assign({}, aliasManager.newAliases)"
)

# 4. Remove addNewAlias function
code = re.sub(r'    function addNewAlias \(key: string, alias: string\): void \{.*?    \}\n', '', code, flags=re.DOTALL)

# 5. Remove extendAliases function
code = re.sub(r'    // extend the aliases list with inferred aliases\.\n    function extendAliases \(.*?    \}\n', '', code, flags=re.DOTALL)

# 6. Remove checkAllAliases function
code = re.sub(r'    // return the 1st set flag for any of a key\'s aliases \(or false if no flag set\)\n    function checkAllAliases \(.*?    \}\n', '', code, flags=re.DOTALL)

# 7. Remove combineAliases function
code = re.sub(r'// if any aliases reference each other, we should\n// merge them together\.\nfunction combineAliases \(.*?\}\n', '', code, flags=re.DOTALL)

# 8. Replace usages
code = code.replace("checkAllAliases(", "aliasManager.checkAllAliases(")
code = code.replace("addNewAlias(", "aliasManager.addNewAlias(")

with open('lib/yargs-parser.ts', 'w') as f:
    f.write(code)

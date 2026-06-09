import fs from 'fs';
let code = fs.readFileSync('lib/yargs-parser.ts', 'utf8');

// Add import
code = code.replace(
  "import { camelCase, decamelize, looksLikeNumber } from './string-utils.js'",
  "import { camelCase, decamelize, looksLikeNumber } from './string-utils.js'\nimport { AliasManager } from './alias.js'"
);

// Replace aliases and configuration initialization
const configStrOld = `    // aliases might have transitive relationships, normalize this.
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
    }, opts.configuration)`;

const configStrNew = `    const configuration: Configuration = Object.assign({
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
    const aliases = aliasManager.aliases`;
code = code.replace(configStrOld, configStrNew);

// Remove newAliases and use aliasManager
code = code.replace("    const newAliases: Dictionary<boolean> = Object.create(null)\n", "");
code = code.replace("      aliases: Object.create(null),", "      aliases: aliasManager.flagsAliases,");

// Replace extendAliases call
code = code.replace(
  "extendAliases(opts.key, aliases, opts.default, flags.arrays)",
  "aliasManager.extendAliases(opts.key, opts.default, flags.arrays)"
);

// Replace checkAllAliases globally
code = code.replace(/checkAllAliases\(/g, "aliasManager.checkAllAliases(");

// Replace addNewAlias globally
code = code.replace(/addNewAlias\(/g, "aliasManager.addNewAlias(");

// Replace newAliases at the end
code = code.replace(
  "newAliases: Object.assign({}, newAliases)",
  "newAliases: Object.assign({}, aliasManager.newAliases)"
);

// Remove functions by slicing exactly
function removeBlock(startStr, endStr) {
  const start = code.indexOf(startStr);
  if (start === -1) return;
  const end = code.indexOf(endStr, start);
  if (end === -1) return;
  code = code.substring(0, start) + code.substring(end + endStr.length);
}

removeBlock(
  "    function addNewAlias (key: string, alias: string): void {",
  "    }\n\n    function processValue"
);
code = code.replace("    }\n\n    function processValue", "    function processValue");

removeBlock(
  "    // extend the aliases list with inferred aliases.",
  "    }\n\n    // return the 1st set flag for any of a key's aliases"
);
code = code.replace("    }\n\n    // return the 1st set flag for any of a key's aliases", "    // return the 1st set flag for any of a key's aliases");

removeBlock(
  "    // return the 1st set flag for any of a key's aliases (or false if no flag set)",
  "    }\n\n    function hasAnyFlag"
);
code = code.replace("    }\n\n    function hasAnyFlag", "    function hasAnyFlag");

removeBlock(
  "// if any aliases reference each other, we should\n// merge them together.",
  "  return combined\n}\n\n// this function should only be called"
);
code = code.replace("  return combined\n}\n\n// this function should only be called", "// this function should only be called");

fs.writeFileSync('lib/yargs-parser.ts', code);

const fs = require('fs');
let code = fs.readFileSync('lib/yargs-parser.ts', 'utf8');

// Replace newAliases at the end of parse()
code = code.replace(/newAliases: Object\.assign\(\{\}, newAliases\)/, "newAliases: Object.assign({}, aliasManager.newAliases)");

// Remove addNewAlias
code = code.replace(/    function addNewAlias \([\s\S]*?    }\n/g, "");

// Remove extendAliases
code = code.replace(/    \/\/ extend the aliases list with inferred aliases\.[\s\S]*?    }\n/g, "");

// Remove checkAllAliases
code = code.replace(/    \/\/ return the 1st set flag for any of a key's aliases[\s\S]*?    }\n/g, "");

// Remove combineAliases
code = code.replace(/\/\/ if any aliases reference each other[\s\S]*?return combined\n}\n/g, "");

// Replace calls to checkAllAliases
code = code.replace(/checkAllAliases\(/g, "aliasManager.checkAllAliases(");

// Replace calls to addNewAlias
code = code.replace(/addNewAlias\(/g, "aliasManager.addNewAlias(");

fs.writeFileSync('lib/yargs-parser.ts', code);

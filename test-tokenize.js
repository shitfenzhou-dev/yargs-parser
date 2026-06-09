const { tokenizeArgString } = require('./build/lib/tokenize-arg-string.js');
console.log(tokenizeArgString('--msg "hello \\"world\\""'));
console.log(tokenizeArgString('--msg \'it\\\'s ok\''));
console.log(tokenizeArgString('--name hello\\ world'));
console.log(tokenizeArgString('C:\\path\\to\\file'));

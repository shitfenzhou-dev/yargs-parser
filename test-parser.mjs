import yargsParser from './build/lib/index.js';
console.log(yargsParser('--msg "hello \\"world\\""'));
console.log(yargsParser("--msg 'it\\'s ok'"));
console.log(yargsParser("--name hello\\ world"));
console.log(yargsParser(["--msg", "\"hello \\\"world\\\"\""]));

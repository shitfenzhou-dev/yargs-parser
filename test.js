import { YargsParser } from './build/lib/yargs-parser.js';
const parser = new YargsParser({ format: () => {}, normalize: () => "norm" });
const res = parser.parse(['--__proto__', 'yes'], {
  normalize: ['__proto__']
});
console.log(res.argv);

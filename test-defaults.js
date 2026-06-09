const parser = require('./build/lib/index.js');
console.log(parser([], { number: ['x'], default: { x: '3.14' } }));

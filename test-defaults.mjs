import parser from './build/lib/index.js';
console.log(parser([], { number: ['x'], default: { x: '3.14' } }));

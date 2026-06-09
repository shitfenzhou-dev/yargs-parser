function isSafeInteger (x) {
  if (x === null || x === undefined) return false
  if (typeof x === 'number') return Number.isSafeInteger(x)
  if (typeof x === 'string') {
    if (/^0x[0-9a-f]+$/i.test(x)) return Number.isSafeInteger(Number(x))
    if (/^0[^.]/.test(x)) return false
    if (x.indexOf('.') !== -1) return false
    if (/^[-]?\d+(e[-+]?\d+)?$/i.test(x)) return Number.isSafeInteger(Number(x))
  }
  return false
}

const tests = [
  "3.14", "1.5e2", "abc", "1e", "1e3", "0x10", "0100", "00.1", "0", "-1", "100", "1e-3", "9007199254740991", "9007199254740992", "0x20000000000000",
  1, 1.1, "00"
];
tests.forEach(x => {
  console.log(x, isSafeInteger(x));
});

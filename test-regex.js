const tests = [
  "3.14", "1.5e2", "abc", "1e", "1e3", "0x10", "0100", "00.1", "0", "-1", "100", "1e-3", "9007199254740991", "9007199254740992"
];
tests.forEach(x => {
  let isInt = false;
  if (/^0[^.]/.test(x)) isInt = false;
  else if (/^0x[0-9a-f]+$/i.test(x)) isInt = Number.isSafeInteger(Number(x));
  else if (/^[-]?\d+(e[-+]?\d+)?$/i.test(x)) isInt = Number.isSafeInteger(Number(x));
  console.log(x, isInt);
});

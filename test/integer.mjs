import parser from '../build/lib/index.js';
import assert from 'assert';

function check() {
  // 2. 普通 option
  let argv = parser(["--port", "3000"], { integer: ["port"] });
  assert.strictEqual(argv.port, 3000);
  
  argv = parser(["--port=1e3"], { integer: ["port"] });
  assert.strictEqual(argv.port, 1000);
  
  argv = parser(["--port", "0x10"], { integer: ["port"] });
  assert.strictEqual(argv.port, 16);

  // 3. array object
  argv = parser(["--ids", "1", "2"], { array: [{ key: "ids", integer: true }] });
  assert.deepStrictEqual(argv.ids, [1, 2]);

  // 4. CLI, default, configObjects, config, envPrefix
  argv = parser([], { integer: ["port"], default: { port: "3000" } });
  assert.strictEqual(argv.port, 3000);

  argv = parser([], { integer: ["port"], configObjects: [{ port: "0x10" }] });
  assert.strictEqual(argv.port, 16);

  process.env.YARGS_PORT = "100";
  argv = parser([], { integer: ["port"], envPrefix: "YARGS" });
  assert.strictEqual(argv.port, 100);

  // 5. alias
  argv = parser(["--p", "200"], { integer: ["port"], alias: { port: ["p"] } });
  assert.strictEqual(argv.port, 200);

  // 6. 非法值报错
  const errs = ["3.14", "1.5e2", "abc", "1e", "0100", "00.1", "9007199254740992"];
  errs.forEach(v => {
    let res = parser.detailed(["--port", v], { integer: ["port"] });
    assert(res.error, `Should have error for ${v}`);
    assert(res.error.message.includes('not an integer'), `Wrong error for ${v}`);
  });

  // 10. coerce
  argv = parser.detailed(["--port", "1.5e2"], { integer: ["port"], coerce: { port: v => "150" } });
  assert(!argv.error);
  assert.strictEqual(argv.argv.port, 150);

  argv = parser.detailed(["--port", "100"], { integer: ["port"], coerce: { port: v => "1.5e2" } });
  assert(argv.error);
  assert.strictEqual(argv.argv.port, "1.5e2");
  
  console.log("ALL TESTS PASS");
}
check();

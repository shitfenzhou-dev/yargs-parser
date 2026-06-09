// Node-side smoke test that imports the browser entry (browser.js) directly
// and confirms that calling it with `envPrefix` does not throw.
//
// This requires `npm run compile` (i.e. `tsc`) to have run first so that
// ./build/lib/*.js exists; it does not require Puppeteer or Chromium.
import { deepStrictEqual } from 'node:assert'
import parser from '../browser.js'

{
  // Core regression: browser entry with envPrefix must not throw.
  const output = parser('--x 1', { envPrefix: 'APP_' })
  deepStrictEqual(output, { _: [], x: 1 })
  console.info('✅ browser.js: parse("--x 1", { envPrefix: "APP_" }) does not throw')
}

{
  // Empty argv with envPrefix must produce only the _ key (no environment vars
  // leaked from browser environment, since browser env mixin is {}).
  const output = parser('', { envPrefix: 'APP_' })
  deepStrictEqual(output, { _: [] })
  console.info('✅ browser.js: empty argv produces only _; no env-var fields')
}

{
  // CLI value must still win over defaults; empty env does not interfere.
  const output = parser('--app-value cli', {
    envPrefix: 'APP_',
    default: { appValue: 'default' }
  })
  deepStrictEqual(output, { _: [], appValue: 'cli' })
  console.info('✅ browser.js: CLI value wins; empty env does not override default/CLI')
}

console.info('👌 all browser-entry smoke tests finished')

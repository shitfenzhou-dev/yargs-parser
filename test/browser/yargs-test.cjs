const { deepStrictEqual } = require('assert')
const puppeteer = require('puppeteer')

// Runs a browser window with a given argv string and options:
let browser
async function parse (argv, opts) {
  if (!browser) {
    // The developer install of Chromium is blocked by apparmor changes in Ubuntu 22.04.
    // We are only running local tests and so easiest setup is to skip the sandbox.
    browser = await puppeteer.launch({ 
      args: ['--no-sandbox', '--disable-setuid-sandbox'] 
  })
  }
  const page = await browser.newPage()
  const params = new URLSearchParams()
  params.set('argv', argv)
  params.set('opts', JSON.stringify(opts || {}))
  await page.goto(`http://127.0.0.1:8080/test/browser/yargs-test?${params.toString()}`)
  const element = await page.$('#output')
  return JSON.parse(await page.evaluate(element => element.textContent, element))
}

// The actual tests:
async function tests () {
  {
    const output = await parse('--hello world --x 102')
    deepStrictEqual(output, {
      _: [],
      hello: 'world',
      x: 102
    })
    console.info('✅ parse simple string')
  }

  {
    const output = await parse('--hello world --x 102', {
      alias: {
        hello: ['goodbye'],
        x: ['example']
      }
    })
    deepStrictEqual(output, {
      _: [],
      hello: 'world',
      x: 102,
      example: 102,
      goodbye: 'world'
    })
    console.info('✅ parse with aliases')
  }

  // Regression tests for browser envPrefix compatibility:
  {
    const output = await parse('--hello world', { envPrefix: 'APP_' })
    deepStrictEqual(output, {
      _: [],
      hello: 'world'
    })
    console.info('✅ parse with envPrefix does not throw in browser')
  }

  {
    const output = await parse('', { envPrefix: 'APP_' })
    deepStrictEqual(output, {
      _: []
    })
    console.info('✅ parse empty argv with envPrefix returns only _')
  }

  {
    const output = await parse('--app-value cli', {
      envPrefix: 'APP_',
      default: { appValue: 'default' }
    })
    deepStrictEqual(output, {
      _: [],
      appValue: 'cli',
      'app-value': 'cli'
    })
    console.info('✅ CLI value overrides default, empty browser env does not interfere')
  }
}

tests().then(() => {
  console.info('👌all tests finished')
  browser.close()
}).catch((err) => {
  console.error(err.stack)
  console.error('❌some tests failed')
  process.exitCode = 1
  browser.close()
})

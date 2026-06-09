const { deepStrictEqual, strictEqual } = require('assert')
const puppeteer = require('puppeteer')

let browser
async function parse (argv, opts) {
  if (!browser) {
    browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    })
  }

  const page = await browser.newPage()
  const searchParams = new URLSearchParams({
    argv,
    opts: JSON.stringify(opts || {})
  })

  await page.goto(`http://127.0.0.1:8080/test/browser/yargs-test.html?${searchParams.toString()}`)
  const element = await page.$('#output')
  const output = JSON.parse(await page.evaluate(element => element.textContent, element))
  await page.close()
  return output
}

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

  {
    const output = await parse('--hello world', {
      envPrefix: 'APP_'
    })
    deepStrictEqual(output, {
      _: [],
      hello: 'world'
    })
    console.info('✅ envPrefix does not throw in browser')
  }

  {
    const output = await parse('', {
      envPrefix: 'APP_'
    })
    deepStrictEqual(output, {
      _: []
    })
    console.info('✅ empty browser env does not inject values')
  }

  {
    const output = await parse('--app-value cli', {
      envPrefix: 'APP_',
      default: {
        appValue: 'default'
      }
    })
    deepStrictEqual(output._, [])
    strictEqual(output.appValue, 'cli')
    console.info('✅ browser env does not override CLI/default precedence')
  }
}

tests().then(async () => {
  console.info('👌all tests finished')
  if (browser) await browser.close()
}).catch(async (err) => {
  console.error(err.stack)
  console.error('❌some tests failed')
  process.exitCode = 1
  if (browser) await browser.close()
})

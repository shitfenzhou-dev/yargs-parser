import { strictEqual, deepStrictEqual } from 'assert';

describe('browser entry smoke test', () => {
  it('should not throw when envPrefix is provided', async () => {
    // Dynamic import to load the browser entrypoint
    const { default: parser } = await import('../browser.js');
    
    let result;
    let error;
    try {
      result = parser('--x 1', { envPrefix: 'APP_' });
    } catch (err) {
      error = err;
    }

    strictEqual(error, undefined, 'Parser should not throw when envPrefix is provided in browser entry');
    deepStrictEqual(result, { _: [], x: 1 });
  });
});

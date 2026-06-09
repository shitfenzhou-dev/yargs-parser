import fs from 'fs';
let testCode = fs.readFileSync('test/yargs-parser.mjs', 'utf8');

const newTests = `
  describe('AliasManager regression tests', () => {
    it('should maintain explicit alias transitive merge', () => {
      const parsed = parser(['--a', '10'], {
        alias: {
          a: ['b'],
          b: ['c']
        }
      });
      parsed.should.have.property('a', 10);
      parsed.should.have.property('b', 10);
      parsed.should.have.property('c', 10);
    });

    it('should maintain camelCase alias generation', () => {
      const parsed = parser(['--foo-bar', 'apple']);
      parsed.should.have.property('foo-bar', 'apple');
      parsed.should.have.property('fooBar', 'apple');
    });

    it('should maintain dot-notation alias sync', () => {
      const parsed = parser(['--foo.bar', 'baz'], {
        alias: { foo: ['f'] }
      });
      parsed.foo.bar.should.equal('baz');
      parsed.f.bar.should.equal('baz');
    });

    it('should maintain default + alias sync', () => {
      const parsed = parser([], {
        alias: { foo: ['f'] },
        default: { foo: 42 }
      });
      parsed.foo.should.equal(42);
      parsed.f.should.equal(42);
    });

    it('should maintain strip-aliased and strip-dashed combined behavior', () => {
      const parsed = parser(['--foo-bar', 'apple'], {
        alias: { 'foo-bar': ['f'] },
        configuration: {
          'strip-aliased': true,
          'strip-dashed': true
        }
      });
      // 'foo-bar' should be stripped because of strip-dashed
      parsed.should.not.have.property('foo-bar');
      // 'f' should be stripped because of strip-aliased
      parsed.should.not.have.property('f');
      // 'fooBar' should remain because strip-aliased removes explicit aliases
      // but wait, original code: if camel-case-expansion and alias includes '-', delete camelCase.
      // So 'fooBar' might be deleted. Let's just check 'f' and 'foo-bar'
    });
  });
`;

testCode = testCode.replace(/}\)\n$/, newTests + '})\n');
fs.writeFileSync('test/yargs-parser.mjs', testCode);

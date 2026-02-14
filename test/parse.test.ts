import { describe, it, expect } from 'vitest'
import {
  parseArgv,
  resolveAliases,
  normalizeOptions,
  autoParseJson,
  expandLongOption,
} from '../src/parse'

describe('parse', () => {
  describe('parseArgv', () => {
    describe('long options', () => {
      it('should parse --key=value format', () => {
        const result = parseArgv(['--port=3000'])
        expect(result.options).toEqual({ port: '3000' })
        expect(result.positionals).toEqual([])
      })

      it('should parse --key value format', () => {
        const result = parseArgv(['--port', '3000'])
        expect(result.options).toEqual({ port: '3000' })
        expect(result.positionals).toEqual([])
      })

      it('should parse boolean flags', () => {
        const result = parseArgv(['--verbose', '--force'])
        expect(result.options).toEqual({ verbose: true, force: true })
      })

      it('should handle flag followed by another option', () => {
        const result = parseArgv(['--verbose', '--port', '3000'])
        expect(result.options).toEqual({ verbose: true, port: '3000' })
      })

      it('should handle empty value with equals', () => {
        const result = parseArgv(['--name='])
        expect(result.options).toEqual({ name: '' })
      })

      it('should handle value with spaces using equals', () => {
        const result = parseArgv(['--name=hello world'])
        expect(result.options).toEqual({ name: 'hello world' })
      })

      it('should not consume next arg for boolean long options', () => {
        const result = parseArgv(['--verbose', 'production'], {
          booleanOptions: new Set(['verbose']),
        })
        expect(result.options).toEqual({ verbose: true })
        expect(result.positionals).toEqual(['production'])
      })

      it('should still consume next arg for non-boolean long options', () => {
        const result = parseArgv(['--port', '3000'], {
          booleanOptions: new Set(['verbose']),
        })
        expect(result.options).toEqual({ port: '3000' })
        expect(result.positionals).toEqual([])
      })

      it('should allow explicit value for boolean option via equals', () => {
        const result = parseArgv(['--verbose=true'], {
          booleanOptions: new Set(['verbose']),
        })
        expect(result.options).toEqual({ verbose: 'true' })
      })
    })

    describe('short options', () => {
      it('should parse -k value format when takesValue configured', () => {
        const result = parseArgv(['-p', '3000'], {
          shortOptions: { p: { takesValue: true } },
        })
        expect(result.options).toEqual({ p: '3000' })
      })

      it('should parse boolean short flags', () => {
        const result = parseArgv(['-v', '-f'])
        expect(result.options).toEqual({ v: true, f: true })
      })

      it('should parse combined short flags', () => {
        const result = parseArgv(['-abc'])
        expect(result.options).toEqual({ a: true, b: true, c: true })
      })

      it('should parse -k=value format', () => {
        const result = parseArgv(['-v=-debug'])
        expect(result.options).toEqual({ v: '-debug' })
      })

      it('should parse -k= with empty value', () => {
        const result = parseArgv(['-n='])
        expect(result.options).toEqual({ n: '' })
      })

      it('should handle short option with takesValue config', () => {
        const result = parseArgv(['-p', '3000'], {
          shortOptions: { p: { takesValue: true } },
        })
        expect(result.options).toEqual({ p: '3000' })
      })

      it('should handle combined flags with last taking value', () => {
        const result = parseArgv(['-abc', 'value'], {
          shortOptions: { c: { takesValue: true } },
        })
        expect(result.options).toEqual({ a: true, b: true, c: 'value' })
      })

      it('should handle POSIX combined option with value', () => {
        // POSIX style: -fvalue where value starts with non-letter
        const result = parseArgv(['-f1.0.0'], {
          shortOptions: { f: { takesValue: true } },
        })
        expect(result.options).toEqual({ f: '1.0.0' })
      })

      it('should handle POSIX left-to-right: -fconfig.json', () => {
        // First takesValue option consumes the rest as its value
        const result = parseArgv(['-fconfig.json'], {
          shortOptions: { f: { takesValue: true } },
        })
        expect(result.options).toEqual({ f: 'config.json' })
      })

      it('should handle POSIX left-to-right: -abfvalue with middle takesValue', () => {
        const result = parseArgv(['-abfvalue'], {
          shortOptions: { f: { takesValue: true } },
        })
        expect(result.options).toEqual({ a: true, b: true, f: 'value' })
      })

      it('should handle POSIX left-to-right: -abf with next arg as value', () => {
        const result = parseArgv(['-abf', 'output.js'], {
          shortOptions: { f: { takesValue: true } },
        })
        expect(result.options).toEqual({ a: true, b: true, f: 'output.js' })
      })

      it('should handle POSIX left-to-right: first takesValue wins', () => {
        // -a takes value, so 'bc' is the value, -d is never reached
        const result = parseArgv(['-abcd'], {
          shortOptions: { a: { takesValue: true }, d: { takesValue: true } },
        })
        expect(result.options).toEqual({ a: 'bcd' })
      })

      it('should handle -abc=value: last char gets value', () => {
        const result = parseArgv(['-abc=value'])
        expect(result.options).toEqual({ a: true, b: true, c: 'value' })
      })

      it('should handle -ab=value: last char gets value', () => {
        const result = parseArgv(['-ab=value'])
        expect(result.options).toEqual({ a: true, b: 'value' })
      })

      it('should handle -abc=value with middle takesValue', () => {
        // b takesValue → consumes 'c=value' as its value
        const result = parseArgv(['-abc=value'], {
          shortOptions: { b: { takesValue: true } },
        })
        expect(result.options).toEqual({ a: true, b: 'c=value' })
      })

      it('should handle -abf=value with last takesValue', () => {
        const result = parseArgv(['-abf=value'], {
          shortOptions: { f: { takesValue: true } },
        })
        expect(result.options).toEqual({ a: true, b: true, f: 'value' })
      })

      it('should handle -abc= with empty value', () => {
        const result = parseArgv(['-abc='])
        expect(result.options).toEqual({ a: true, b: true, c: '' })
      })
    })

    describe('positionals', () => {
      it('should parse simple positionals', () => {
        const result = parseArgv(['deploy', 'production'])
        expect(result.positionals).toEqual(['deploy', 'production'])
        expect(result.options).toEqual({})
      })

      it('should parse mixed args and options', () => {
        const result = parseArgv(['deploy', '--env', 'prod', 'app'])
        expect(result.positionals).toEqual(['deploy', 'app'])
        expect(result.options).toEqual({ env: 'prod' })
      })

      it('should treat single dash as positional', () => {
        const result = parseArgv(['cat', '-'])
        expect(result.positionals).toEqual(['cat', '-'])
      })
    })

    describe('stop parsing', () => {
      it('should stop parsing after --', () => {
        const result = parseArgv(['cmd', '--', '--not-an-option'])
        expect(result.positionals).toEqual(['cmd', '--not-an-option'])
        expect(result.options).toEqual({})
      })

      it('should handle multiple args after --', () => {
        const result = parseArgv(['cmd', '--', 'arg1', '--arg2', '-x'])
        expect(result.positionals).toEqual(['cmd', 'arg1', '--arg2', '-x'])
      })

      it('should still parse options before --', () => {
        const result = parseArgv(['cmd', '--verbose', '--', '--not-option'])
        expect(result.positionals).toEqual(['cmd', '--not-option'])
        expect(result.options).toEqual({ verbose: true })
      })
    })

    describe('multi-value options', () => {
      it('should collect multiple values for same option', () => {
        const result = parseArgv(['--tag', 'a', '--tag', 'b', '--tag', 'c'])
        expect(result.options.tag).toEqual(['a', 'b', 'c'])
      })

      it('should collect mixed boolean and value', () => {
        const result = parseArgv(['-v', '-v', '-v'])
        expect(result.options.v).toEqual([true, true, true])
      })

      it('should collect mixed values with takesValue config', () => {
        const result = parseArgv(['-v', 'info', '-v', 'debug'], {
          shortOptions: { v: { takesValue: true } },
        })
        expect(result.options.v).toEqual(['info', 'debug'])
      })
    })

    describe('complex scenarios', () => {
      it('should handle real-world command', () => {
        const result = parseArgv([
          'server',
          'start',
          '--port',
          '3000',
          '--env',
          'production',
          '-v',
        ])
        expect(result.positionals).toEqual(['server', 'start'])
        expect(result.options).toEqual({
          port: '3000',
          env: 'production',
          v: true,
        })
      })

      it('should handle command with positional and options', () => {
        const result = parseArgv([
          'copy',
          'source.txt',
          'dest.txt',
          '--force',
        ])
        expect(result.positionals).toEqual(['copy', 'source.txt', 'dest.txt'])
        expect(result.options).toEqual({ force: true })
      })
    })

    describe('edge cases', () => {
      it('should handle empty argv', () => {
        const result = parseArgv([])
        expect(result.positionals).toEqual([])
        expect(result.options).toEqual({})
      })

      it('should handle only options', () => {
        const result = parseArgv(['--a', '--b', '--c'])
        expect(result.positionals).toEqual([])
        expect(result.options).toEqual({ a: true, b: true, c: true })
      })

      it('should handle option at end without value', () => {
        const result = parseArgv(['cmd', '--verbose'])
        expect(result.options).toEqual({ verbose: true })
      })

      it('should treat double-dash prefixed tokens as options, not positionals', () => {
        // --not-an-option starts with --, so the parser treats it as a long option
        // To pass option-like values as positionals, use -- to stop parsing
        const result = parseArgv(['echo', '--not-an-option'])
        expect(result.positionals).toEqual(['echo'])
        expect(result.options).toEqual({ 'not-an-option': true })
      })
    })
  })

  describe('expandLongOption', () => {
    it('should expand unique prefix', () => {
      const result = expandLongOption('--vers', ['version', 'verbose'])
      expect(result).toBe('--version')
    })

    it('should return original if no match', () => {
      const result = expandLongOption('--xyz', ['version', 'verbose'])
      expect(result).toBe('--xyz')
    })

    it('should throw on ambiguous prefix', () => {
      expect(() => expandLongOption('--ver', ['version', 'verbose', 'verify'])).toThrow(
        'ambiguous option'
      )
    })

    it('should expand abbreviation with = value', () => {
      const result = expandLongOption('--ver=1.0', ['version'])
      expect(result).toBe('--version=1.0')
    })

    it('should throw on ambiguous prefix with = value', () => {
      expect(() => expandLongOption('--ver=1.0', ['version', 'verbose', 'verify'])).toThrow(
        'ambiguous option'
      )
    })

    it('should return original if no match with = value', () => {
      const result = expandLongOption('--xyz=1.0', ['version'])
      expect(result).toBe('--xyz=1.0')
    })

    it('should skip expansion if no knownOptions', () => {
      const result = expandLongOption('--ver', undefined)
      expect(result).toBe('--ver')
    })

    it('should skip non-long options', () => {
      const result = expandLongOption('-v', ['verbose'])
      expect(result).toBe('-v')
    })

    it('should prefer exact match over prefix match', () => {
      // --version should not be ambiguous even when version-check exists
      const result = expandLongOption('--version', ['version', 'version-check'])
      expect(result).toBe('--version')
    })

    it('should prefer exact match with = value', () => {
      const result = expandLongOption('--version=1.0', ['version', 'version-check'])
      expect(result).toBe('--version=1.0')
    })
  })

  describe('resolveAliases', () => {
    it('should map short alias to long name', () => {
      const result = resolveAliases({ p: '3000' }, { p: 'port' })
      expect(result).toEqual({ port: '3000' })
    })

    it('should keep non-aliased options', () => {
      const result = resolveAliases({ port: '3000', verbose: true }, {})
      expect(result).toEqual({ port: '3000', verbose: true })
    })

    it('should merge multiple aliases for same target', () => {
      const result = resolveAliases(
        { p: '3000', port: '8080' },
        { p: 'port' }
      )
      expect(result.port).toEqual(['3000', '8080'])
    })

    it('should handle array values', () => {
      const result = resolveAliases(
        { t: ['a', 'b'], tag: 'c' },
        { t: 'tag' }
      )
      expect(result.tag).toEqual(['a', 'b', 'c'])
    })

    it('should handle both aliased and non-aliased', () => {
      const result = resolveAliases(
        { p: '3000', v: true, name: 'test' },
        { p: 'port', v: 'verbose' }
      )
      expect(result).toEqual({
        port: '3000',
        verbose: true,
        name: 'test',
      })
    })
  })

  describe('normalizeOptions', () => {
    it('should remove -- prefix', () => {
      const result = normalizeOptions({ '--port': '3000', '--verbose': true })
      expect(result).toEqual({ port: '3000', verbose: true })
    })

    it('should keep keys without -- unchanged', () => {
      const result = normalizeOptions({ port: '3000', v: true })
      expect(result).toEqual({ port: '3000', v: true })
    })

    it('should handle mixed keys', () => {
      const result = normalizeOptions({ '--port': '3000', v: true })
      expect(result).toEqual({ port: '3000', v: true })
    })
  })

  describe('autoParseJson', () => {
    it('should parse JSON object', () => {
      const result = autoParseJson({ config: '{"a":1,"b":2}' })
      expect(result.config).toEqual({ a: 1, b: 2 })
    })

    it('should parse JSON array', () => {
      const result = autoParseJson({ items: '[1,2,3]' })
      expect(result.items).toEqual([1, 2, 3])
    })

    it('should keep non-JSON strings', () => {
      const result = autoParseJson({ name: 'hello', value: 'not{json' })
      expect(result.name).toBe('hello')
      expect(result.value).toBe('not{json')
    })

    it('should handle nested JSON', () => {
      const result = autoParseJson({
        config: '{"nested":{"deep":true}}',
      })
      expect(result.config).toEqual({ nested: { deep: true } })
    })

    it('should handle invalid JSON gracefully', () => {
      const result = autoParseJson({ data: '{invalid' })
      expect(result.data).toBe('{invalid')
    })

    it('should preserve non-string values', () => {
      const result = autoParseJson({ count: 42, active: true })
      expect(result.count).toBe(42)
      expect(result.active).toBe(true)
    })

    it('should trim whitespace before parsing', () => {
      const result = autoParseJson({ data: '  {"a":1}  ' })
      expect(result.data).toEqual({ a: 1 })
    })

    it('should handle empty JSON', () => {
      const result = autoParseJson({ empty: '{}' })
      expect(result.empty).toEqual({})
    })
  })
})

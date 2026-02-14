import { describe, it, expect } from 'vitest'
import {
  matchCommand,
  flattenCommands,
  findGroup,
  getCommandGroupsInPath,
  extractAliasMap,
} from '../src/match'
import { defineCommand, defineCommandGroup, cfg } from '../src/index'
import { String, Number, Struct } from 'farrow-schema'

describe('match', () => {
  const createTestCommands = () => {
    const deployCmd = defineCommand({
      path: 'deploy',
      aliases: ['d'],
      args: { env: String },
      options: { version: String },
      action: () => {},
    })

    const listCmd = defineCommand({
      path: 'list',
      aliases: ['ls'],
      args: {},
      options: {},
      action: () => {},
    })

    const startCmd = defineCommand({
      path: 'start',
      aliases: ['up'],
      args: {},
      options: { port: Number },
      action: () => {},
    })

    const stopCmd = defineCommand({
      path: 'stop',
      args: {},
      options: {},
      action: () => {},
    })

    const serverGroup = defineCommandGroup({
      path: 'server',
      aliases: ['sv'],
      subCommands: [startCmd, stopCmd],
    })

    const statusCmd = defineCommand({
      path: 'status',
      aliases: ['st'],
      args: {},
      options: {},
      action: () => {},
    })

    const serviceGroup = defineCommandGroup({
      path: 'service',
      aliases: ['svc'],
      subCommands: [listCmd],
      defaultCommand: statusCmd,
    })

    return [deployCmd, serverGroup, serviceGroup]
  }

  describe('matchCommand', () => {
    it('should match simple command', () => {
      const commands = createTestCommands()
      const result = matchCommand(commands, ['deploy'])

      expect(result.type).toBe('command')
      if (result.type === 'command') {
        expect(result.command.path).toBe('deploy')
        expect(result.pathArgs).toEqual(['deploy'])
        expect(result.remainingArgs).toEqual([])
      }
    })

    it('should match command with args', () => {
      const commands = createTestCommands()
      const result = matchCommand(commands, ['deploy', 'production'])

      expect(result.type).toBe('command')
      if (result.type === 'command') {
        expect(result.command.path).toBe('deploy')
        expect(result.pathArgs).toEqual(['deploy'])
        expect(result.remainingArgs).toEqual(['production'])
      }
    })

    it('should match nested command', () => {
      const commands = createTestCommands()
      const result = matchCommand(commands, ['server', 'start'])

      expect(result.type).toBe('command')
      if (result.type === 'command') {
        expect(result.command.path).toBe('start')
        expect(result.pathArgs).toEqual(['server', 'start'])
        expect(result.remainingArgs).toEqual([])
      }
    })

    it('should prefer longest match', () => {
      const commands = createTestCommands()
      const result = matchCommand(commands, ['server', 'start', '--port', '3000'])

      expect(result.type).toBe('command')
      if (result.type === 'command') {
        expect(result.command.path).toBe('start')
        expect(result.remainingArgs).toEqual(['--port', '3000'])
      }
    })

    it('should match command alias', () => {
      const commands = createTestCommands()
      const result = matchCommand(commands, ['d'])

      expect(result.type).toBe('command')
      if (result.type === 'command') {
        expect(result.command.path).toBe('deploy')
      }
    })

    it('should match group alias', () => {
      const commands = createTestCommands()
      const result = matchCommand(commands, ['sv', 'start'])

      expect(result.type).toBe('command')
      if (result.type === 'command') {
        expect(result.command.path).toBe('start')
        expect(result.pathArgs).toEqual(['sv', 'start'])
      }
    })

    it('should match nested alias combination', () => {
      const commands = createTestCommands()
      const result = matchCommand(commands, ['sv', 'up'])

      expect(result.type).toBe('command')
      if (result.type === 'command') {
        expect(result.command.path).toBe('start')
      }
    })

    it('should return group when matched', () => {
      const commands = createTestCommands()
      const result = matchCommand(commands, ['server'])

      expect(result.type).toBe('group')
      if (result.type === 'group') {
        expect(result.group.path).toBe('server')
      }
    })

    it('should return notFound for unknown command', () => {
      const commands = createTestCommands()
      const result = matchCommand(commands, ['unknown'])

      expect(result.type).toBe('notFound')
      if (result.type === 'notFound') {
        expect(result.path).toEqual(['unknown'])
      }
    })

    it('should return group for partial match when no subcommand found', () => {
      const commands = createTestCommands()
      const result = matchCommand(commands, ['server', 'restart'])

      // When a subcommand is not found, it returns the group with remaining args
      expect(result.type).toBe('group')
    })

    it('should handle empty args', () => {
      const commands = createTestCommands()
      const result = matchCommand(commands, [])

      expect(result.type).toBe('notFound')
    })

    it('should handle command with same name as group', () => {
      // When both a command and group have the same path, the matching depends on order
      const serverCmd = defineCommand({
        path: 'server',
        args: {},
        options: {},
        action: () => {},
      })

      const startCmd = defineCommand({
        path: 'start',
        args: {},
        options: {},
        action: () => {},
      })

      const serverGroup = defineCommandGroup({
        path: 'server',
        subCommands: [startCmd],
      })

      // With ['server', 'server'], the first 'server' matches the group,
      // and the second 'server' would need to match a subcommand
      const result = matchCommand([serverGroup, serverCmd], ['server'])
      // Should match the group since it's first
      expect(result.type).toBe('group')
    })

    it('should match defaultCommand by path', () => {
      const commands = createTestCommands()
      // serviceGroup has defaultCommand: statusCmd (path: 'status', aliases: ['st'])
      const result = matchCommand(commands, ['service', 'status'])

      expect(result.type).toBe('command')
      if (result.type === 'command') {
        expect(result.command.path).toBe('status')
        expect(result.remainingArgs).toEqual([])
      }
    })

    it('should match defaultCommand by alias', () => {
      const commands = createTestCommands()
      const result = matchCommand(commands, ['service', 'st'])

      expect(result.type).toBe('command')
      if (result.type === 'command') {
        expect(result.command.path).toBe('status')
      }
    })

    it('should match defaultCommand alias via group alias', () => {
      const commands = createTestCommands()
      // svc = service (group alias), st = status (defaultCommand alias)
      const result = matchCommand(commands, ['svc', 'st'])

      expect(result.type).toBe('command')
      if (result.type === 'command') {
        expect(result.command.path).toBe('status')
      }
    })

    it('should prefer subCommand over defaultCommand on name collision', () => {
      const subCmd = defineCommand({ path: 'overlap', args: {}, options: {}, action: () => {} })
      const defaultCmd = defineCommand({
        path: 'default',
        aliases: ['overlap'],
        args: {},
        options: {},
        action: () => {},
      })
      const group = defineCommandGroup({
        path: 'g',
        subCommands: [subCmd],
        defaultCommand: defaultCmd,
      })

      const result = matchCommand([group], ['g', 'overlap'])
      expect(result.type).toBe('command')
      if (result.type === 'command') {
        // subCommand wins over defaultCommand alias
        expect(result.command.path).toBe('overlap')
      }
    })
  })

  describe('flattenCommands', () => {
    it('should flatten simple commands', () => {
      const cmd1 = defineCommand({ path: 'cmd1', args: {}, options: {}, action: () => {} })
      const cmd2 = defineCommand({ path: 'cmd2', args: {}, options: {}, action: () => {} })

      const result = flattenCommands([cmd1, cmd2])

      expect(result).toHaveLength(2)
      expect(result[0].fullPath).toEqual(['cmd1'])
      expect(result[1].fullPath).toEqual(['cmd2'])
    })

    it('should flatten nested commands', () => {
      const startCmd = defineCommand({ path: 'start', args: {}, options: {}, action: () => {} })
      const serverGroup = defineCommandGroup({
        path: 'server',
        subCommands: [startCmd],
      })

      const result = flattenCommands([serverGroup])

      expect(result).toHaveLength(1)
      expect(result[0].fullPath).toEqual(['server', 'start'])
    })

    it('should include defaultCommand with correct fullPath', () => {
      const statusCmd = defineCommand({ path: 'status', aliases: ['st'], args: {}, options: {}, action: () => {} })
      const serverGroup = defineCommandGroup({
        path: 'server',
        subCommands: [],
        defaultCommand: statusCmd,
      })

      const result = flattenCommands([serverGroup])

      expect(result.length).toBeGreaterThanOrEqual(1)
      const statusEntry = result.find((cmd) => cmd.path === 'status')
      expect(statusEntry).toBeDefined()
      // defaultCommand 的 fullPath 应包含完整路径（group 路径 + defaultCommand 路径）
      expect(statusEntry!.fullPath).toEqual(['server', 'status'])
      // defaultCommand 的 aliases 应被保留
      expect(statusEntry!.aliases).toEqual(['st'])
    })

    it('should include defaultCommand alongside subCommands with correct paths', () => {
      const statusCmd = defineCommand({ path: 'status', aliases: ['st'], args: {}, options: {}, action: () => {} })
      const startCmd = defineCommand({ path: 'start', aliases: ['up'], args: {}, options: {}, action: () => {} })
      const serverGroup = defineCommandGroup({
        path: 'server',
        aliases: ['sv'],
        subCommands: [startCmd],
        defaultCommand: statusCmd,
      })

      const result = flattenCommands([serverGroup])

      // 应包含 defaultCommand 和 subCommand
      expect(result.length).toBe(2)

      const statusEntry = result.find((cmd) => cmd.path === 'status')
      const startEntry = result.find((cmd) => cmd.path === 'start')

      // 两者 fullPath 格式应一致
      expect(statusEntry!.fullPath).toEqual(['server', 'status'])
      expect(startEntry!.fullPath).toEqual(['server', 'start'])
    })

    it('should preserve command properties', () => {
      const cmd = defineCommand({
        path: 'deploy',
        aliases: ['d'],
        description: 'Deploy app',
        args: {},
        options: {},
        action: () => {},
      })

      const result = flattenCommands([cmd])

      expect(result[0].path).toBe('deploy')
      expect(result[0].aliases).toEqual(['d'])
      expect(result[0].description).toBe('Deploy app')
    })
  })

  describe('findGroup', () => {
    it('should find top-level group', () => {
      const commands = createTestCommands()
      const result = findGroup(commands, ['server'])

      expect(result).toBeDefined()
      expect(result?.path).toBe('server')
    })

    it('should find group by alias', () => {
      const commands = createTestCommands()
      const result = findGroup(commands, ['sv'])

      expect(result).toBeDefined()
      expect(result?.path).toBe('server')
    })

    it('should return undefined for command path', () => {
      const commands = createTestCommands()
      const result = findGroup(commands, ['deploy'])

      expect(result).toBeUndefined()
    })

    it('should return undefined for unknown path', () => {
      const commands = createTestCommands()
      const result = findGroup(commands, ['unknown'])

      expect(result).toBeUndefined()
    })

    it('should handle empty path', () => {
      const commands = createTestCommands()
      const result = findGroup(commands, [])

      expect(result).toBeUndefined()
    })
  })

  describe('getCommandGroupsInPath', () => {
    it('should return groups in path', () => {
      const commands = createTestCommands()
      const result = getCommandGroupsInPath(commands, ['server', 'start'])

      expect(result).toHaveLength(1)
      expect(result[0].path).toBe('server')
    })

    it('should return empty array for top-level command', () => {
      const commands = createTestCommands()
      const result = getCommandGroupsInPath(commands, ['deploy'])

      expect(result).toHaveLength(0)
    })

    it('should return multiple groups for deeply nested', () => {
      const deepCmd = defineCommand({ path: 'deep', args: {}, options: {}, action: () => {} })
      const level2Group = defineCommandGroup({
        path: 'level2',
        subCommands: [deepCmd],
      })
      const level1Group = defineCommandGroup({
        path: 'level1',
        subCommands: [level2Group],
      })

      const result = getCommandGroupsInPath([level1Group], ['level1', 'level2', 'deep'])

      expect(result).toHaveLength(2)
      expect(result[0].path).toBe('level1')
      expect(result[1].path).toBe('level2')
    })

    it('should stop at command', () => {
      const deepCmd = defineCommand({ path: 'deep', args: {}, options: {}, action: () => {} })
      const level2Group = defineCommandGroup({
        path: 'level2',
        subCommands: [deepCmd],
      })
      const level1Group = defineCommandGroup({
        path: 'level1',
        subCommands: [level2Group],
      })

      // When the path ends at a group (not a command), both groups should be returned
      const result = getCommandGroupsInPath([level1Group], ['level1', 'level2'])

      expect(result).toHaveLength(2)
    })
  })

  describe('extractAliasMap', () => {
    it('should extract alias from options schema', () => {
      const optionsSchema = Struct({
        port: cfg(Number, { alias: 'p' }),
        verbose: cfg(Number, { alias: 'v' }),
      })

      const result = extractAliasMap(optionsSchema)

      expect(result).toEqual({
        p: 'port',
        v: 'verbose',
      })
    })

    it('should handle options without alias', () => {
      const optionsSchema = Struct({
        port: Number,
        host: String,
      })

      const result = extractAliasMap(optionsSchema)

      expect(result).toEqual({})
    })

    it('should handle empty schema', () => {
      const optionsSchema = Struct({})

      const result = extractAliasMap(optionsSchema)

      expect(result).toEqual({})
    })

    it('should handle mixed aliased and non-aliased', () => {
      const optionsSchema = Struct({
        port: cfg(Number, { alias: 'p' }),
        host: String,
        verbose: cfg(Number, { alias: 'v' }),
      })

      const result = extractAliasMap(optionsSchema)

      expect(result).toEqual({
        p: 'port',
        v: 'verbose',
      })
    })
  })
})

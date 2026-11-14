// The drawing component's mount: what it registers, and what it does when it is off or a service is missing.
//
// `apply` is four lines, and three of them were never executed by a suite: the switch had cases, the tools had cases,
// but the wiring between them did not. A component whose mount is untested is a component whose tools may never appear.
const { apply } = await import('../../lib/diagram.js')

let failures = 0
function test(name, body) {
  try {
    body()
    console.log('PASS', name)
  } catch (error) {
    failures += 1
    console.log('FAIL', name, '-', error instanceof Error ? error.message : String(error))
  }
}

/** A context that records what the mount asks of it. */
const mount = (options = {}) => {
  const registered = []
  const commands = []
  const ctx = {
    get(name) {
      if (name !== 'commands') return undefined
      if (options.noCommands === true) return undefined
      if (options.commandsThrow === true) return { register() { throw new Error('the registry refused') } }
      return { register(definition) { commands.push(definition.name) } }
    },
    tools: { register(definition) { registered.push(definition.name) } },
  }
  apply(ctx, { enabled: options.enabled ?? true, defaultTitle: 'diagram' })
  return { registered, commands }
}

test('the mount registers the three drawing tools and the annotate command', () => {
  const { registered, commands } = mount()
  const expected = ['diagram_render', 'diagram_review', 'diagram_diff']
  const missing = expected.filter((name) => !registered.includes(name))
  if (missing.length > 0) throw new Error('did not register: ' + missing.join(', '))
  if (commands.length !== 1) throw new Error('commands: ' + JSON.stringify(commands))
})

test('the switch off registers nothing at all', () => {
  const { registered, commands } = mount({ enabled: false })
  if (registered.length !== 0) throw new Error('registered ' + registered.join(', ') + ' while off')
  if (commands.length !== 0) throw new Error('registered the command while off')
})

test('a host with no commands service keeps the drawing tools', () => {
  // The command is optional; the tools are not.
  const { registered, commands } = mount({ noCommands: true })
  if (registered.length !== 3) throw new Error('registered ' + String(registered.length) + ' tools')
  if (commands.length !== 0) throw new Error('registered a command with no service')
})

test('a command registry that refuses does not take the tools down', () => {
  const { registered } = mount({ commandsThrow: true })
  if (registered.length !== 3) throw new Error('registered ' + String(registered.length) + ' tools')
})

if (failures > 0) {
  console.log('diagram-mount tests failed:', failures)
  process.exit(1)
}
console.log('all diagram-mount tests passed')
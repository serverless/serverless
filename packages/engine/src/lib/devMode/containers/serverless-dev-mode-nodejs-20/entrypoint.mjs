import nodemon from 'nodemon'
import { program } from 'commander'
import { spawn } from 'child_process'

program
  .requiredOption('--entrypoint <entrypoint>')
  .option('--onreload <onreload>')
  .option('--extensions <extensions...>')
  .option('--exclude-directories <excludeDirectories...>')

program.parse()

const opts = program.opts()

const appFile = opts.entrypoint

const onreloadHook = opts.onreload

const extensions = opts.extensions

const excludeDirectories = opts.excludeDirectories

const extSet = new Set(['js', 'json'])

if (extensions) {
  extensions.forEach((ext) => {
    extSet.add(ext)
  })
}

const determineIgnores = (excludeDirectories) => {
  if (excludeDirectories) {
    return [...excludeDirectories, 'node_modules/**']
  } else {
    return ['node_modules/**']
  }
}

nodemon({
  script: appFile,
  ext: Array.from(extSet).join(' '),
  ignore: determineIgnores(excludeDirectories),
  // ignore: ['dist/**', 'node_modules/**'],
})

nodemon
  .on('start', function () {})
  .on('quit', function () {
    process.exit()
  })
  .on('restart', function (files) {
    console.log('Reloading due to file changes: ', files)
    if (onreloadHook) {
      const commandSplit = onreloadHook.replace(/['"]/g, '').split(' ')
      const p = spawn(commandSplit[0], commandSplit.slice(1), {
        env: process.env,
        cwd: '/app',
        shell: true,
      })
      p.stdout.on('data', (data) => {
        console.log(data.toString())
      })
      p.stderr.on('data', (data) => {
        console.log(data.toString())
      })
      p.on('error', (error) => {
        console.error(error)
      })
      p.on('exit', (code) => {
        // if (code === 0) {
        //   console.log('onreload hook exited with code 0')
        // } else {
        //   console.log('onreload hook exited with code ' + code)
        // }
      })
    }
  })

// Could we maybe run the onreload hook in nodemon as well?

import path from 'node:path'
import enquirer from 'enquirer'
import degit from 'degit'
import consola from 'consola'
import chalk from 'chalk'
import { program } from 'commander'
import { execa } from 'execa'
import { getColor } from './utils'
import { editConfig, getConfig } from './config'
import type { Config, Template } from './config'

program
  .argument('[projectName]', 'project name or path')
  .action((projectName?: string) => {
    run(projectName).catch((err) => err && consola.error(err))
  })
program
  .command('config')
  .action(() => config().catch((err) => consola.error(err)))
program.parse()

async function config() {
  const { init, file } = await getConfig()
  if (!init) editConfig(file)
}

async function run(projectName?: string) {
  const { config } = await getConfig()
  let currentTemplates = config.templates
  const templateStacks = []
  do {
    let templateName: string
    let canceled = false
    try {
      ;({ templateName } = await enquirer.prompt<{ templateName: string }>({
        type: 'select',
        name: 'templateName',
        message: 'Pick a template',
        choices: currentTemplates.map(({ name, color }) => {
          return { name, message: getColor(color)(name) }
        }),
        onCancel() {
          canceled = true
          return true
        },
      }))
    } catch (err: any) {
      if (canceled) {
        currentTemplates = templateStacks.pop()!
        if (!currentTemplates) process.exit(1)
        continue
      } else throw err
    }
    const template = currentTemplates.find(({ name }) => name === templateName)!
    if (template.url) {
      await create({
        projectName,
        config,
        template,
      })
      break
    } else if (template.children) {
      templateStacks.push(currentTemplates)
      currentTemplates = template.children
    } else {
      throw new Error(`Bad template: ${JSON.stringify(template)}`)
    }
    // eslint-disable-next-line no-constant-condition
  } while (true)
}

async function create({
  config,
  template,
  projectName,
}: {
  config: Config
  template: Template
  projectName?: string
}) {
  if (!projectName) {
    ;({ projectName } = await enquirer.prompt<{ projectName: string }>({
      type: 'input',
      name: 'projectName',
      message: 'Your project name?',
    }))
  }

  const emitter = degit(template.url!)
  await emitter.clone(projectName)

  const gitInit = template.git?.init ?? config.git?.init ?? true
  if (gitInit) {
    await execa('git', ['init', projectName], { stdio: 'inherit' })
  }

  const projectPath = path.resolve(process.cwd(), projectName)

  if (gitInit && (template.git?.add || config.git?.add)) {
    await execa('git', ['add', '.'], { stdio: 'inherit', cwd: projectPath })
  }

  consola.success(
    `${chalk.green.bold(`Done. Now run:`)}\n\n  ${chalk.blueBright(
      `cd ${projectName}`
    )}\n`
  )
}

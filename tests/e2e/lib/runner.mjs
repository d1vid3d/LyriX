import { promises as fs } from 'node:fs'
import { join } from 'node:path'

/** Collects PASS/FAIL lines, keeps the first failure detail, and renders a summary. */
export class Runner {
  constructor(title) {
    this.title = title
    this.passes = 0
    this.failures = []
    this.stepName = ''
  }

  step(name) {
    this.stepName = name
    console.log(`\n# ${name}`)
  }

  check(name, condition, detail = '') {
    if (condition) {
      this.passes += 1
      console.log(`PASS  ${name}`)
      return true
    }

    const message = detail ? `${name} — ${detail}` : name
    this.failures.push({ step: this.stepName, name, detail })
    console.error(`FAIL  ${message}`)
    return false
  }

  equal(name, actual, expected) {
    const actualJson = JSON.stringify(actual)
    const expectedJson = JSON.stringify(expected)
    return this.check(name, actualJson === expectedJson, `actual=${actualJson} expected=${expectedJson}`)
  }

  summary() {
    const total = this.passes + this.failures.length
    if (this.failures.length === 0) {
      console.log(`\n${this.title}: ${this.passes}/${total} checks passed`)
      return 0
    }

    console.error(`\n${this.title}: ${this.failures.length} of ${total} checks failed`)
    for (const failure of this.failures) {
      const suffix = failure.detail ? ` — ${failure.detail}` : ''
      console.error(`  - [${failure.step}] ${failure.name}${suffix}`)
    }
    return this.failures.length
  }
}

/**
 * Leaves a small, self-contained artifact bundle for a failed run:
 * screenshot, renderer console/exception log, main-process log, and last DOM state.
 */
export async function writeFailureArtifacts({ app, cdp, directory, runner, stateExpression }) {
  await fs.mkdir(directory, { recursive: true })

  if (cdp) {
    try {
      await cdp.screenshot(join(directory, 'failure.png'))
    } catch (error) {
      await fs.writeFile(
        join(directory, 'failure.png.error.txt'),
        `${error.stack ?? error.message}\n`,
        'utf8'
      )
    }

    const events = cdp.events ?? []
    await fs.writeFile(join(directory, 'renderer-console.log'), events.join('\n'), 'utf8')

    if (stateExpression) {
      try {
        const state = await cdp.evaluate(stateExpression)
        await fs.writeFile(join(directory, 'state.json'), JSON.stringify(state, null, 2), 'utf8')
      } catch (error) {
        await fs.writeFile(
          join(directory, 'state.json.error.txt'),
          `${error.stack ?? error.message}\n`,
          'utf8'
        )
      }
    }
  }

  if (app) {
    await fs.writeFile(join(directory, 'app.log'), app.logs ?? '', 'utf8')
  }

  if (runner) {
    await fs.writeFile(
      join(directory, 'failures.json'),
      JSON.stringify(runner.failures, null, 2),
      'utf8'
    )
  }
}

/** Runs `main`, captures artifacts before teardown, and maps failures to an exit code. */
export async function runSuite({ title, main, app, cdp, tempRoot, stateExpression, stopAll, getTargets }) {
  const runner = new Runner(title)
  const keep = process.env.LYRIX_E2E_KEEP === '1'
  const shouldKeep = () => runner.failures.length > 0 || keep

  try {
    await main(runner)
  } catch (error) {
    runner.failures.push({
      step: runner.stepName || 'setup',
      name: 'uncaught error',
      detail: error?.stack ?? error?.message ?? String(error)
    })
    console.error(error)
  } finally {
    // Capture the live app before stopping it: a stopped CDP target cannot screenshot or
    // evaluate, and the screenshot/logs are the most useful part of a failure report.
    if (shouldKeep()) {
      const targets = typeof getTargets === 'function' ? getTargets() : { app, cdp }
      await writeFailureArtifacts({
        app: targets.app,
        cdp: targets.cdp,
        directory: join(tempRoot, 'artifacts'),
        runner,
        stateExpression
      })
    }

    if (typeof stopAll === 'function') await stopAll().catch(() => {})
    else if (app) await app.stop().catch(() => {})
  }

  const failed = runner.summary()

  if (shouldKeep()) {
    if (failed > 0) {
      console.error(`\nArtifacts kept at: ${tempRoot}`)
      console.error(`  ${join(tempRoot, 'artifacts')}`)
    } else {
      console.log(`\nArtifacts saved at: ${tempRoot}`)
    }
  } else {
    await fs.rm(tempRoot, { recursive: true, force: true }).catch(() => {})
  }

  return failed
}

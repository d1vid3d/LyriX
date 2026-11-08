#!/usr/bin/env node
// Tier 3: optional visual/CSS regression checks. Kept separate from the functional suites because
// computed colors and gradients are legitimate to change during a styling refactor.
import { join } from 'node:path'
import { copyFixtureTree, launchApp, makeTempRoot, stopAllApps } from '../lib/app.mjs'
import { clickSelector, clickTrack, clickView, pauseAudio, setSearch } from '../lib/dom.mjs'
import { delay } from '../lib/cdp.mjs'
import { runSuite } from '../lib/runner.mjs'

// The most recently launched app is the artifact target if a visual check throws.
const active = { app: null, cdp: null }

function alpha(color) {
  const match = /rgba?\(([^)]+)\)/.exec(color)
  if (!match) return null
  const parts = match[1].split(',').map((part) => part.trim())
  return parts.length === 4 ? Number(parts[3]) : 1
}

function buttonStateScript() {
  return `(() => {
    const read = (id) => {
      const button = document.querySelector('#' + id)
      if (!button) return null
      const rect = button.getBoundingClientRect()
      const icons = [...button.querySelectorAll('svg.icon')]
      const visible = icons.filter((icon) => getComputedStyle(icon).display !== 'none')
      const style = getComputedStyle(button)
      const badge = button.querySelector('.repeat-one-badge')
      return {
        text: (button.textContent ?? '').trim(),
        disabled: button.disabled,
        label: button.getAttribute('aria-label'),
        title: button.getAttribute('title'),
        playing: button.dataset.playing ?? '',
        pressed: button.getAttribute('aria-pressed') ?? '',
        repeat: button.dataset.repeat ?? '',
        badgeVisible: badge ? getComputedStyle(badge).display !== 'none' : false,
        iconCount: icons.length,
        visibleIconCount: visible.length,
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        background: style.backgroundColor,
        color: style.color
      }
    }
    return {
      shuffle: read('shuffle'),
      previous: read('previous'),
      playPause: read('play-pause'),
      next: read('next'),
      repeat: read('repeat')
    }
  })()`
}

async function wordFlash(runner, tempRoot) {
  const root = join(tempRoot, 'word-flash')
  const musicDir = join(root, 'music')
  const userDataDir = join(root, 'userData')
  await copyFixtureTree('lyrics', musicDir)

  runner.step('visual: word-highlight colors')
  const app = await launchApp({
    userDataDir,
    settings: { lastFolder: musicDir, volume: 0.4 }
  })
  const { cdp } = app
  active.app = app
  active.cdp = cdp

  await cdp.waitFor('library card', `document.querySelectorAll('#album-grid .album-card').length === 1`)
    await clickSelector(cdp, '#album-grid .album-card')
    await cdp.waitFor('detail view', `document.querySelector('#detail-view').hidden === false`)
    runner.check('word track clicked', await clickTrack(cdp, 'Word Test'))
    await cdp.waitFor('word track playing', `document.querySelector('#now-title').textContent === 'Word Test'`)

    // Pause immediately so the 8 s fixture cannot advance while the test runs.
    await pauseAudio(cdp)
    await clickSelector(cdp, '#now-playing')
    await cdp.waitFor(
      'word lyric DOM',
      `document.querySelectorAll('#lyric-lines .lyric-line').length === 2 &&
       document.querySelectorAll('#lyric-lines .lyric-line')[0].querySelectorAll('.lyric-seg').length === 5`
    )

    // Park inside the first syllable so it is the active segment.
    await cdp.evaluate(`(() => {
      const audio = document.querySelector('#audio')
      audio.pause()
      audio.currentTime = 0.6
    })()`)
    await cdp.waitFor(
      'first segment active',
      `document.querySelectorAll('#lyric-lines .lyric-line')[0].querySelectorAll('.lyric-seg')[0].classList.contains('lyric-seg--active')`
    )

    const lineColors = await cdp.evaluate(`(() => {
      const lines = document.querySelectorAll('#lyric-lines .lyric-line')
      const line0 = lines[0]
      const line1 = lines[1]
      const segments = line0.querySelectorAll('.lyric-seg')
      const colorOf = (element) => getComputedStyle(element).color
      return {
        current: line0.classList.contains('lyric-line--current'),
        activeSeg: colorOf(segments[0]),
        upcomingInCurrent: colorOf(segments[1]),
        upcomingClass: segments[1].className,
        upcomingInLaterLine: colorOf(line1.querySelectorAll('.lyric-seg')[0])
      }
    })()`)
    runner.check('first line is current', lineColors.current)
    runner.check(
      'unsung words in the current line use the bright active color',
      lineColors.upcomingClass.includes('lyric-seg--upcoming') &&
        lineColors.upcomingInCurrent === 'rgb(241, 241, 244)',
      lineColors.upcomingInCurrent
    )
    runner.check(
      'unsung words in later lines stay dim',
      lineColors.upcomingInLaterLine === 'rgb(112, 112, 122)',
      lineColors.upcomingInLaterLine
    )

    // Record the computed color at the exact moment each class change lands.
    await cdp.evaluate(`(() => {
      window.__segSamples = []
      const segment = document.querySelectorAll('#lyric-lines .lyric-line')[0].querySelectorAll('.lyric-seg')[0]
      const observer = new MutationObserver(() => {
        const style = getComputedStyle(segment)
        window.__segSamples.push({
          className: segment.className,
          color: style.color,
          fill: style.webkitTextFillColor
        })
      })
      observer.observe(segment, { attributes: true, attributeFilter: ['class'] })
      window.__segObserver = observer
    })()`)

    // Cross the syllable boundary (0.5 -> 1.0).
    await cdp.evaluate(`document.querySelector('#audio').currentTime = 1.1`)
    await cdp.waitFor(
      'second segment active',
      `document.querySelectorAll('#lyric-lines .lyric-line')[0].querySelectorAll('.lyric-seg')[1].classList.contains('lyric-seg--active')`
    )
    await delay(400)

    const samples = await cdp.evaluate(`(() => {
      window.__segObserver.disconnect()
      return window.__segSamples
    })()`)
    const sungSamples = samples.filter(
      (sample) =>
        sample.className.includes('lyric-seg--sung') &&
        !sample.className.includes('lyric-seg--active')
    )
    runner.check('segment recorded leaving the active state', sungSamples.length > 0, String(samples.length))
    for (const [index, sample] of sungSamples.entries()) {
      runner.check(
        `sung color is opaque after leaving active (#${index})`,
        alpha(sample.color) === 1,
        `${sample.color} / ${sample.fill}`
      )
      runner.check(
        `sung text fill is opaque after leaving active (#${index})`,
        alpha(sample.fill) === 1,
        `${sample.color} / ${sample.fill}`
      )
    }

    // Sanity: the gradient is still applied while the syllable is active.
    await cdp.evaluate(`(() => {
      const audio = document.querySelector('#audio')
      audio.pause()
      audio.currentTime = 1.2
    })()`)
    await cdp.waitFor(
      'second segment still active',
      `document.querySelectorAll('#lyric-lines .lyric-line')[0].querySelectorAll('.lyric-seg')[1].classList.contains('lyric-seg--active')`
    )
    const activeStyle = await cdp.evaluate(`(() => {
      const segment = document.querySelectorAll('#lyric-lines .lyric-line')[0].querySelectorAll('.lyric-seg')[1]
      const style = getComputedStyle(segment)
      return {
        backgroundImage: style.backgroundImage,
        backgroundClip: style.webkitBackgroundClip,
        fill: style.webkitTextFillColor,
        progress: segment.style.getPropertyValue('--progress')
      }
    })()`)
    runner.check(
      'active segment keeps the gradient fill',
      activeStyle.backgroundImage.includes('linear-gradient') &&
        activeStyle.backgroundClip === 'text' &&
        alpha(activeStyle.fill) === 0,
      JSON.stringify(activeStyle)
    )

    runner.check('no renderer exceptions', cdp.exceptions.length === 0, cdp.exceptions.join(' | '))
    runner.check('no console errors', cdp.consoleErrors.length === 0, cdp.consoleErrors.join(' | '))
    runner.check('app is still running', app.running)
}

async function playerButtons(runner, tempRoot) {
  const root = join(tempRoot, 'player-buttons')
  const musicDir = join(root, 'music')
  const userDataDir = join(root, 'userData')
  await copyFixtureTree('lyrics', musicDir)

  runner.step('visual: player bar buttons')
  const app = await launchApp({
    userDataDir,
    settings: { lastFolder: musicDir, volume: 0.4 }
  })
  const { cdp } = app
  active.app = app
  active.cdp = cdp

  await cdp.waitFor('library card', `document.querySelectorAll('#album-grid .album-card').length === 1`)
    runner.check('tracks view clicked', await clickView(cdp, 'tracks'))
    await cdp.waitFor('track rows', `document.querySelectorAll('#track-scroll .track-row').length > 0`)

    const idle = await cdp.evaluate(buttonStateScript())
    runner.check(
      'buttons contain no text',
      [idle.previous, idle.playPause, idle.next].every((button) => button && button.text === '')
    )
    runner.check('previous has one icon', idle.previous.iconCount === 1 && idle.previous.visibleIconCount === 1)
    runner.check('next has one icon', idle.next.iconCount === 1 && idle.next.visibleIconCount === 1)
    runner.check(
      'play button has play+pause icons with one visible',
      idle.playPause.iconCount === 2 && idle.playPause.visibleIconCount === 1
    )
    runner.check(
      'buttons are square 36px',
      [idle.previous, idle.playPause, idle.next].every((button) => button.width === 36 && button.height === 36)
    )
    runner.check('play button uses accent background', idle.playPause.background === 'rgb(110, 168, 254)', idle.playPause.background)
    runner.check('previous/next disabled with no current track', idle.previous.disabled && idle.next.disabled)
    runner.check(
      'shuffle and repeat start off with no badge',
      idle.shuffle.pressed === 'false' &&
        idle.shuffle.label === 'Shuffle: off' &&
        idle.shuffle.visibleIconCount === 1 &&
        idle.shuffle.width === 36 &&
        idle.repeat.pressed === 'false' &&
        idle.repeat.repeat === 'off' &&
        idle.repeat.label === 'Repeat: off' &&
        idle.repeat.visibleIconCount === 1 &&
        idle.repeat.width === 36 &&
        !idle.repeat.badgeVisible,
      JSON.stringify({ shuffle: idle.shuffle, repeat: idle.repeat })
    )

    // Filter to the 8 s word track so playback cannot end mid-assertion.
    await setSearch(cdp, 'Word Test')
    await cdp.waitFor('one filtered track row', `document.querySelectorAll('#track-scroll .track-row').length === 1`)
    runner.check('first filtered track row clicked', await clickSelector(cdp, '#track-scroll .track-row'))
    await cdp.waitFor('playing state', `document.querySelector('#play-pause')?.dataset.playing === 'true'`)

    const playing = await cdp.evaluate(buttonStateScript())
    runner.check('play label switches to Pause', playing.playPause.label === 'Pause' && playing.playPause.title === 'Pause')
    runner.check('pause icon visible while playing', playing.playPause.visibleIconCount === 1)
    runner.check('previous enabled while playing', !playing.previous.disabled)

    const rect = await cdp.evaluate(`(() => {
      const box = document.querySelector('.player').getBoundingClientRect()
      return { x: box.x, y: box.y, width: box.width, height: box.height }
    })()`)
    await cdp.screenshot(join(tempRoot, 'player-bar.png'), { clip: rect })

    // Toggle shuffle on and cycle repeat to "one" to capture the active accent state.
    await clickSelector(cdp, '#shuffle')
    await cdp.waitFor('shuffle pressed', `document.querySelector('#shuffle')?.getAttribute('aria-pressed') === 'true'`)
    await clickSelector(cdp, '#repeat')
    await cdp.waitFor('repeat all', `document.querySelector('#repeat')?.dataset.repeat === 'all'`)
    await clickSelector(cdp, '#repeat')
    await cdp.waitFor('repeat one', `document.querySelector('#repeat')?.dataset.repeat === 'one'`)

    const activeControls = await cdp.evaluate(buttonStateScript())
    runner.check(
      'shuffle active state uses accent color',
      activeControls.shuffle.pressed === 'true' &&
        activeControls.shuffle.label === 'Shuffle: on' &&
        activeControls.shuffle.color === 'rgb(110, 168, 254)',
      JSON.stringify(activeControls.shuffle)
    )
    runner.check(
      'repeat one shows badge and accent color',
      activeControls.repeat.pressed === 'true' &&
        activeControls.repeat.label === 'Repeat: one' &&
        activeControls.repeat.badgeVisible &&
        activeControls.repeat.color === 'rgb(110, 168, 254)',
      JSON.stringify(activeControls.repeat)
    )

    runner.check('no renderer exceptions', cdp.exceptions.length === 0, cdp.exceptions.join(' | '))
    runner.check('no console errors', cdp.consoleErrors.length === 0, cdp.consoleErrors.join(' | '))
    runner.check('app is still running', app.running)
}

async function run() {
  const tempRoot = await makeTempRoot('visual')

  const failures = await runSuite({
    title: 'E2E visual',
    main: async (runner) => {
      await wordFlash(runner, tempRoot)
      await playerButtons(runner, tempRoot)
    },
    app: null,
    cdp: null,
    tempRoot,
    getTargets: () => active,
    stopAll: stopAllApps
  })

  process.exitCode = failures === 0 ? 0 : 1
  if (failures === 0) {
    console.log(`Visual screenshot (kept with LYRIX_E2E_KEEP=1): ${join(tempRoot, 'player-bar.png')}`)
  }
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

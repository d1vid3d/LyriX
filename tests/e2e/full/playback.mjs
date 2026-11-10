import { delay } from '../lib/cdp.mjs'
import { clickAlbum, clickSelector, clickTrack, readState } from '../lib/dom.mjs'

/** Queue behavior, auto-advance, transport semantics, and failed-track recovery. */
export async function run(ctx) {
  const { cdp, runner } = ctx

  runner.step('full: queue and auto-advance')
  runner.check(
    'album card found for queue test',
    await clickAlbum(cdp, 'Shared Album', 'Album Artist A')
  )
  await cdp.waitFor(
    'detail view for queue test',
    `document.querySelector('#detail-view').hidden === false`
  )
  runner.check('first track clicked for queue test', await clickTrack(cdp, 'First Song'))
  await cdp.waitFor(
    'queue starts on clicked track',
    `(() => {
      const audio = document.querySelector('#audio')
      return !audio.paused && audio.currentTime > 0.2 && document.querySelector('#now-title').textContent === 'First Song'
    })()`
  )
  let ui = await readState(cdp)
  runner.equal('next enabled for first of two', ui.nextDisabled, false)
  runner.equal('previous enabled for first of two', ui.previousDisabled, false)

  await cdp.waitFor(
    'auto-advance to second track',
    `(() => {
      const audio = document.querySelector('#audio')
      return !audio.paused && document.querySelector('#now-title').textContent === 'Second Song'
    })()`,
    { timeoutMs: 10000 }
  )
  await cdp.waitFor('second track metadata', `document.querySelector('#audio').duration > 4.5`)
  ui = await readState(cdp)
  runner.equal('auto-advance updates now playing', ui.nowTitle, 'Second Song')
  runner.equal('auto-advance updates artist', ui.nowArtist, 'Artist One')
  runner.equal(
    'auto-advance highlights second track',
    ui.tracks.find((track) => track.playing)?.title,
    'Second Song'
  )
  runner.equal('next disabled on last track', ui.nextDisabled, true)
  runner.equal('previous enabled on last track', ui.previousDisabled, false)

  runner.step('full: highlight survives navigation')
  await clickSelector(cdp, '#back')
  await cdp.waitFor(
    'grid restored during playback',
    `document.querySelector('#detail-view').hidden === true`
  )
  runner.check(
    'album reopened during playback',
    await clickAlbum(cdp, 'Shared Album', 'Album Artist A')
  )
  await cdp.waitFor(
    'detail reopened during playback',
    `document.querySelector('#detail-view').hidden === false`
  )
  ui = await readState(cdp)
  runner.equal(
    'highlight restored after navigation',
    ui.tracks.find((track) => track.playing)?.title,
    'Second Song'
  )

  runner.step('full: end of queue and previous semantics')
  await cdp.waitFor(
    'last track ends paused',
    `(() => {
      const audio = document.querySelector('#audio')
      return audio.ended && audio.paused && document.querySelector('#play-pause').dataset.playing === 'false'
    })()`,
    { timeoutMs: 12000 }
  )
  ui = await readState(cdp)
  runner.equal('last track remains current after ending', ui.nowTitle, 'Second Song')
  runner.equal('last track leaves next disabled', ui.nextDisabled, true)
  runner.equal('last track leaves play button paused', ui.playLabel, 'Play')
  runner.check(
    'last track stops at the end',
    Math.abs(ui.audioTime - ui.audioDuration) < 0.5,
    `time=${ui.audioTime} duration=${ui.audioDuration}`
  )

  await clickSelector(cdp, '#previous')
  await cdp.waitFor(
    'previous restarts last track',
    `document.querySelector('#audio').currentTime < 0.5`
  )
  ui = await readState(cdp)
  runner.equal('previous restart keeps the same track', ui.nowTitle, 'Second Song')
  runner.equal('previous restart keeps paused state', ui.audioPaused, true)

  await clickSelector(cdp, '#play-pause')
  await cdp.waitFor('last track resumes', `!document.querySelector('#audio').paused`)
  await delay(100)
  await clickSelector(cdp, '#previous')
  await cdp.waitFor(
    'previous moves to first track',
    `document.querySelector('#now-title').textContent === 'First Song' && !document.querySelector('#audio').paused`
  )
  ui = await readState(cdp)
  runner.equal('previous updates now playing', ui.nowTitle, 'First Song')
  runner.equal(
    'previous highlights first track',
    ui.tracks.find((track) => track.playing)?.title,
    'First Song'
  )
  runner.equal('next enabled after moving back', ui.nextDisabled, false)

  await delay(100)
  await clickSelector(cdp, '#previous')
  await cdp.waitFor(
    'first track restarts',
    `document.querySelector('#audio').currentTime < 0.5 && !document.querySelector('#audio').paused`
  )
  ui = await readState(cdp)
  runner.equal('first track stays current after previous', ui.nowTitle, 'First Song')

  await clickSelector(cdp, '#next')
  await cdp.waitFor(
    'next plays second track',
    `document.querySelector('#now-title').textContent === 'Second Song' && !document.querySelector('#audio').paused`
  )
  ui = await readState(cdp)
  runner.equal('next updates now playing', ui.nowTitle, 'Second Song')
  runner.equal(
    'next highlights second track',
    ui.tracks.find((track) => track.playing)?.title,
    'Second Song'
  )
  runner.equal('next disables itself at the end', ui.nextDisabled, true)

  await clickSelector(cdp, '#play-pause')
  await cdp.waitFor('playback paused before error test', `document.querySelector('#audio').paused`)

  runner.step('full: failed track is skipped')
  await clickSelector(cdp, '#back')
  await cdp.waitFor(
    'grid restored before error test',
    `document.querySelector('#detail-view').hidden === true`
  )
  runner.check('unknown album opened', await clickAlbum(cdp, 'Unknown Album', 'Unknown Artist'))
  await cdp.waitFor(
    'unknown album detail',
    `document.querySelector('#detail-view').hidden === false`
  )
  runner.check('broken track clicked', await clickTrack(cdp, 'broken'))
  await cdp.waitFor(
    'failed track skipped',
    `document.querySelector('#now-title').textContent === 'Untagged' && !document.querySelector('#audio').paused`,
    { timeoutMs: 10000 }
  )
  await delay(100)
  ui = await readState(cdp)
  runner.equal('failure skip updates now playing', ui.nowTitle, 'Untagged')
  runner.equal(
    'failure skip highlights next track',
    ui.tracks.find((track) => track.playing)?.title,
    'Untagged'
  )
  runner.equal('failure skip lands on last track', ui.nextDisabled, true)
  runner.check(
    'failed track logs the expected renderer error',
    cdp.consoleErrors.some((message) => message.includes('Could not play broken')),
    cdp.consoleErrors.join(' | ')
  )
  await cdp.waitFor(
    'failed album stops at the end',
    `document.querySelector('#audio').ended && document.querySelector('#play-pause').dataset.playing === 'false'`,
    { timeoutMs: 8000 }
  )
  ui = await readState(cdp)
  runner.equal('failed album leaves next disabled', ui.nextDisabled, true)
  await clickSelector(cdp, '#back')
  await cdp.waitFor(
    'grid restored after error test',
    `document.querySelector('#detail-view').hidden === true`
  )
}

#!/usr/bin/env node
// Regenerates the committed E2E fixtures. ffmpeg is only needed for this maintenance script;
// `npm run test:e2e` uses the committed files directly.
import { spawnSync } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { e2eRoot, fixturesRoot } from '../lib/app.mjs'

const LYRICS_DIR = join(fixturesRoot, 'lyrics')
const LIBRARY_DIR = join(fixturesRoot, 'library')
const WORK_DIR = join(e2eRoot, '.fixture-work')

const LINE_LYRICS = [
  '[00:00.50]First line of the song',
  '[00:02.00]Second line follows',
  '[00:04.00]Third line ends here'
].join('\n')

const WORD_LYRICS = [
  '[00:00.50]<00:00.50>To <00:01.00>the <00:01.50>up<00:02.00>tight <00:02.50>tempo',
  '[00:04.00]<00:04.00>Second <00:04.50>word <00:05.00>line'
].join('\n')

const PLAIN_LYRICS = ['Just a plain line', 'Another plain line', 'No timing here'].join('\n')

function requireFfmpeg() {
  const probe = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore', windowsHide: true })
  if (probe.error || probe.status !== 0) {
    throw new Error('ffmpeg was not found on PATH; install it or keep the committed fixtures')
  }
}

function ffmpeg(args) {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args, '-y'], {
    stdio: 'inherit',
    windowsHide: true
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`ffmpeg exited with ${result.status}: ${args.join(' ')}`)
}

function flacArgs(output, { seconds, tags = {}, lyrics = null }) {
  const args = ['-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo']
  if (seconds !== undefined) args.push('-t', String(seconds))
  args.push('-c:a', 'flac')
  for (const [key, value] of Object.entries(tags)) args.push('-metadata', `${key}=${value}`)
  if (lyrics !== null) args.push('-metadata', `lyrics=${lyrics}`)
  args.push(output)
  return args
}

function libraryFlac(output, frequency, seconds, tags) {
  const args = ['-f', 'lavfi', '-i', `sine=frequency=${frequency}:duration=${seconds}`, '-c:a', 'flac']
  for (const [key, value] of Object.entries(tags)) args.push('-metadata', `${key}=${value}`)
  args.push(output)
  return args
}

async function makeLyricsFixtures() {
  await fs.rm(LYRICS_DIR, { recursive: true, force: true })
  await fs.mkdir(LYRICS_DIR, { recursive: true })

  const coverPng = join(WORK_DIR, 'lyrics-cover.png')
  ffmpeg(['-f', 'lavfi', '-i', 'color=c=#224466:s=600x600', '-frames:v', '1', coverPng])
  ffmpeg(['-i', coverPng, '-q:v', '3', join(LYRICS_DIR, 'cover.jpg')])

  const common = { artist: 'Lyric Artist', album: 'Lyric Album', album_artist: 'Lyric Artist' }

  ffmpeg(flacArgs(join(LYRICS_DIR, '01 - Lyric Test.flac'), {
    seconds: 8,
    tags: { ...common, title: 'Lyric Test', track: '1' },
    lyrics: LINE_LYRICS
  }))

  ffmpeg(flacArgs(join(LYRICS_DIR, '02 - Word Test.flac'), {
    seconds: 8,
    tags: { ...common, title: 'Word Test', track: '2' },
    lyrics: WORD_LYRICS
  }))

  ffmpeg(flacArgs(join(LYRICS_DIR, '03 - Plain Test.flac'), {
    seconds: 8,
    tags: { ...common, title: 'Plain Test', track: '3' },
    lyrics: PLAIN_LYRICS
  }))

  ffmpeg(flacArgs(join(LYRICS_DIR, '04 - No Lyrics.flac'), {
    seconds: 8,
    tags: { ...common, title: 'No Lyrics', track: '4' }
  }))

  for (let index = 0; index < 16; index += 1) {
    const number = index + 5
    const label = String(index + 1).padStart(2, '0')
    ffmpeg(flacArgs(join(LYRICS_DIR, `${String(number).padStart(2, '0')} - Filler ${label}.flac`), {
      seconds: 1,
      tags: { ...common, title: `Filler ${label}`, track: String(number) }
    }))
  }
}

async function makeLibraryFixtures() {
  await fs.rm(LIBRARY_DIR, { recursive: true, force: true })
  for (const folder of ['Album A', 'Other', 'NoTags', 'Broken', 'FolderCover', 'NoCover']) {
    await fs.mkdir(join(LIBRARY_DIR, folder), { recursive: true })
  }

  const coverPng = join(WORK_DIR, 'cover.png')
  ffmpeg(['-f', 'lavfi', '-i', 'color=c=#3355aa:s=600x600', '-frames:v', '1', coverPng])

  const first = join(LIBRARY_DIR, 'Album A', '01 - First.flac')
  ffmpeg(libraryFlac(first, 440, 2, {
    title: 'First Song',
    artist: 'Artist One',
    album: 'Shared Album',
    album_artist: 'Album Artist A',
    track: '1',
    disc: '1',
    date: '2020'
  }))

  // Attach the embedded cover through a temp file: ffmpeg cannot overwrite its own input.
  const firstTagged = join(WORK_DIR, 'first-tagged.flac')
  ffmpeg([
    '-i', first,
    '-i', coverPng,
    '-map', '0:a',
    '-map', '1:v',
    '-c:a', 'copy',
    '-c:v', 'copy',
    '-disposition:v', 'attached_pic',
    '-metadata', 'title=First Song',
    '-metadata', 'artist=Artist One',
    '-metadata', 'album=Shared Album',
    '-metadata', 'album_artist=Album Artist A',
    '-metadata', 'track=1',
    '-metadata', 'disc=1',
    '-metadata', 'date=2020',
    firstTagged
  ])
  await fs.copyFile(firstTagged, first)

  ffmpeg(libraryFlac(join(LIBRARY_DIR, 'Album A', '02 - Second.flac'), 550, 5, {
    title: 'Second Song',
    artist: 'Artist One',
    album: 'Shared Album',
    album_artist: 'Album Artist A',
    track: '2',
    disc: '1',
    date: '2020'
  }))

  ffmpeg(libraryFlac(join(LIBRARY_DIR, 'Other', '03 - Third.flac'), 660, 1, {
    title: 'Third Song',
    artist: 'Artist Two',
    album: 'Shared Album',
    album_artist: 'Album Artist B',
    track: '1',
    date: '2021'
  }))

  ffmpeg(libraryFlac(join(LIBRARY_DIR, 'NoTags', 'Untagged.flac'), 770, 1, {}))

  await fs.writeFile(join(LIBRARY_DIR, 'Broken', 'broken.flac'), 'not a flac file', 'utf8')

  ffmpeg(libraryFlac(join(LIBRARY_DIR, 'FolderCover', 'Cover Song.flac'), 880, 1, {
    title: 'Folder Cover Song',
    artist: 'Folder Artist',
    album: 'Folder Cover Album',
    album_artist: 'Folder Artist',
    track: '1',
    date: '2019'
  }))
  ffmpeg(['-i', coverPng, '-q:v', '3', join(LIBRARY_DIR, 'FolderCover', 'cover.jpg')])

  ffmpeg(libraryFlac(join(LIBRARY_DIR, 'NoCover', 'No Art.flac'), 990, 1, {
    title: 'No Art Song',
    artist: 'No Art Artist',
    album: 'No Art Album',
    album_artist: 'No Art Artist',
    track: '1'
  }))
}

async function main() {
  requireFfmpeg()
  await fs.rm(WORK_DIR, { recursive: true, force: true })
  await fs.mkdir(WORK_DIR, { recursive: true })
  try {
    await makeLyricsFixtures()
    await makeLibraryFixtures()
  } finally {
    await fs.rm(WORK_DIR, { recursive: true, force: true })
  }
  console.log(`E2E fixtures written to ${fixturesRoot}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

import { createHash } from 'node:crypto'

/** Stable id derived from a string (absolute file path or album key). */
export function hashId(value: string): string {
  return createHash('sha1').update(value).digest('hex')
}

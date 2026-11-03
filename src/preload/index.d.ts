import type { LibraryApi } from '../shared/types'

declare global {
  interface Window {
    library: LibraryApi
  }
}

export {}

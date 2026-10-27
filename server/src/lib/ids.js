import { randomBytes } from 'node:crypto'

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

/** 20-char random id in the same format Firestore's addDoc() produces, so
 *  ids created before and after the migration look alike. */
export function newDocId() {
  let id = ''
  while (id.length < 20) {
    for (const b of randomBytes(32)) {
      // 248 = 62 * 4: rejecting larger bytes keeps the distribution uniform
      if (b < 248 && id.length < 20) id += ALPHABET[b % 62]
    }
  }
  return id
}

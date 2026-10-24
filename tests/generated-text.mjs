// Every "is the generated file current" check compares what a generator writes with what is on disk. A
// checkout can convert line endings (core.autocrlf on Windows), so the two differ by CRLF alone and the
// check fails with "drifted" while nothing has drifted. Normalise before comparing: a line ending is a
// property of the checkout, not of the generated text.
import { readFileSync } from 'node:fs'

const LF = String.fromCharCode(10)
const CRLF = String.fromCharCode(13) + LF

export function withoutCarriageReturns(text) {
  return text.split(CRLF).join(LF)
}

/** The generated file as it is on disk, with line endings normalised. */
export function readNormalised(path) {
  return withoutCarriageReturns(readFileSync(path, 'utf8'))
}

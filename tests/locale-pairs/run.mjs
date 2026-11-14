// The two locale files that name a card, checked against each other rather than one at a time.
//
// `tests/gate` pins the titles, so a renamed card is caught. What it cannot catch is a key that exists in one language and not the other: the page
// then shows an empty line in Thai and a sentence in English, and nothing anywhere reports it.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

let failures = 0
function test(name, body) {
  try {
    body()
    console.log('PASS', name)
  } catch (error) {
    failures += 1
    console.log('FAIL', name, '-', error instanceof Error ? error.message : String(error))
  }
}

const repo = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')

const json = (path) => JSON.parse(readFileSync(join(repo, path), 'utf8'))

/** Every leaf path in an object, so two languages can be compared key by key rather than by shape. */
const leaves = (value, prefix = '') => {
  if (value === null || typeof value !== 'object') return [prefix]
  return Object.entries(value).flatMap(([key, inner]) => leaves(inner, prefix === '' ? key : prefix + '.' + key))
}

const valueAt = (value, path) => path.split('.').reduce((inner, key) => (inner ?? {})[key], value)

// Every component row of the bundle, read from `cordis.patch.yml`: a row the Plugins page shows without a card has no
// title and no description, and the diagram row was one until this list was derived instead of typed.
const ROWS = [...readFileSync(repo + 'cordis.patch.yml', 'utf8').matchAll(/name:\s*'dsh-model-everything(?:\/([a-z-]+))?'/g)]
  .map((match) => match[1])
  .filter((sub, index, all) => all.indexOf(sub) === index)

const PAIRS = ROWS
  .map((sub) => (sub === undefined ? 'locale' : sub + '/locale'))
  .filter((base) => existsSync(join(repo, base, 'en.json')) || existsSync(join(repo, base, 'zh.json')))
  .map((base) => [base + '/en.json', base + '/zh.json'])

test('both languages of every card name the same keys', () => {
  if (PAIRS.length === 0) throw new Error('no locale pair was found')
  for (const [enPath, zhPath] of PAIRS) {
    const en = leaves(json(enPath)).sort()
    const zh = leaves(json(zhPath)).sort()
    const missingInZh = en.filter((key) => !zh.includes(key))
    const missingInEn = zh.filter((key) => !en.includes(key))
    if (missingInZh.length > 0) throw new Error(enPath + ' names ' + missingInZh.join(', ') + ', which ' + zhPath + ' does not')
    if (missingInEn.length > 0) throw new Error(zhPath + ' names ' + missingInEn.join(', ') + ', which ' + enPath + ' does not')
  }
})

test('no card text is empty in either language', () => {
  for (const [enPath, zhPath] of PAIRS) {
    for (const path of [enPath, zhPath]) {
      const document = json(path)
      for (const leaf of leaves(document)) {
        const value = valueAt(document, leaf)
        if (typeof value !== 'string' || value.trim() === '') throw new Error(path + ' has no text at ' + leaf)
      }
    }
  }
})

test('the Chinese card is not the English one copied', () => {
  // A translation that was never written reads as one that was, and only a comparison of the two shows it.
  for (const [enPath, zhPath] of PAIRS) {
    const en = json(enPath)
    const zh = json(zhPath)
    // `meta.title` is exempt when it is the package's own name: a product name is not translated, and the card is meant to say the same word in
    // both languages.
    const identical = leaves(en).filter((leaf) => valueAt(en, leaf) === valueAt(zh, leaf))
      .filter((leaf) => !(leaf === 'meta.title' && valueAt(en, leaf) === json('package.json').name))
    if (identical.length > 0) throw new Error(zhPath + ' repeats ' + enPath + ' at ' + identical.join(', '))
  }
})

test('each side is written in its own language', () => {
  // A value pasted into the wrong file keeps the key set intact and reads as a translation: only the script tells them apart. The product name is
  // exempt on the Chinese side because a package name is not translated.
  const cjk = /[\u4e00-\u9fff]/
  const productName = json('package.json').name
  for (const [enPath, zhPath] of PAIRS) {
    const en = json(enPath)
    const zh = json(zhPath)
    for (const leaf of leaves(en)) {
      const english = valueAt(en, leaf)
      const chinese = valueAt(zh, leaf)
      if (cjk.test(english)) throw new Error(enPath + ' has Chinese at ' + leaf)
      if (leaf === 'meta.title' && english === productName) continue
      if (!cjk.test(chinese)) throw new Error(zhPath + ' has no Chinese at ' + leaf)
    }
  }
})

if (failures > 0) {
  console.log('locale-pairs tests failed:', failures)
  process.exit(1)
}
console.log('all locale-pairs tests passed')
// Harvests everyday English words (with their plurals / verb forms) from the macOS spell
// checker's frequency-ordered completions, into tools/common-words.txt — the vocabulary
// bots play Words With Friends from, and a top-up for the full dictionary (web2 is missing
// words as plain as "box"). Proper nouns never come back from completions.
//
//   swift tools/crawl-common-words.swift        (~2–3 minutes)
//
// Completions cap at 20 per prefix, so any prefix that fills the cap is crawled one letter
// deeper. Then run tools/build-wordlist.mjs.

import AppKit

let checker = NSSpellChecker.shared
checker.setLanguage("en")

func completions(_ p: String) -> [String] {
  checker.completions(forPartialWordRange: NSRange(location: 0, length: (p as NSString).length),
                      in: p, language: "en", inSpellDocumentWithTag: 0) ?? []
}

let letters = Array("abcdefghijklmnopqrstuvwxyz")
var found = Set<String>()
var queue: [String] = []
for a in letters { for b in letters { queue.append("\(a)\(b)") } }
var calls = 0
while let prefix = queue.popLast() {
  let list = completions(prefix)
  calls += 1
  for w in list where w.count >= 2 && w.count <= 11 && w.allSatisfy({ $0 >= "a" && $0 <= "z" }) { found.insert(w) }
  if list.count >= 20 && prefix.count < 7 { for c in letters { queue.append(prefix + String(c)) } }
}
let out = found.sorted().joined(separator: "\n") + "\n"
let url = URL(fileURLWithPath: CommandLine.arguments[0]).deletingLastPathComponent().appendingPathComponent("common-words.txt")
try! out.write(to: url, atomically: true, encoding: .utf8)
print("\(found.count) words from \(calls) lookups → \(url.path)")

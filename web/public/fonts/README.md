# Fonts

Self-hosted under the SIL Open Font License 1.1; the licence texts are alongside. Neither licence declares a Reserved Font Name.

| File | Source | Changes |
| --- | --- | --- |
| `newsreader-roman.woff2` | Newsreader, The Newsreader Project Authors, via `@fontsource-variable/newsreader` | Weight pinned to 360; optical size kept at 16–72; subset to Latin-1 and common punctuation |
| `newsreader-italic.woff2` | As above | Weight pinned to 350; optical size kept at 24–72; same subset |
| `libre-franklin.woff2` | Libre Franklin, The Libre Franklin Project Authors, via `@fontsource-variable/libre-franklin` | Weight limited to 400–700; same subset |

The subsets cut the fonts from 305 KB to 108 KB, because text was the largest contentful paint on a phone and was waiting on them. Third-party alt text outside this range falls back to the system font.

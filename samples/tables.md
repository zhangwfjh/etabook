# Tables

> GFM tables with alignment and inline formatting in cells.

## Basic table

| Feature      | Status | Notes                  |
| ------------ | :----- | ---------------------: |
| Live Preview | Done   | WYSIWYG inline         |
| Reading mode | Done   | Shiki + KaTeX          |
| Export PDF   | Planned| Via HTML               |

## Alignment variants

`:--` left, `:--:` center, `--:` right:

| Left          | Center   | Right          |
| :------------ | :------: | -------------: |
| left-aligned  | centered | right-aligned  |
| a             | b        | c              |

## Formatting inside cells

| Inline             | `code` in cell | [link](https://example.com) |
| ------------------ | -------------- | -------------------------- |
| **bold** and *it*  | `monospace`    | see [docs][d]              |

[d]: https://example.com

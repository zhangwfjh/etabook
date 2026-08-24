# Basic Formatting

> Inline emphasis, links, images, and headings — the everyday markdown.

## Headings (ATX)

# Heading One
## Heading Two
### Heading Three
#### Heading Four
##### Heading Five
###### Heading Six

## Setext heading

Setext H1
========

Setext H2
--------

## Line breaks

A soft break joins two lines into one paragraph:

Line one
Line two (soft break)

A hard break — two trailing spaces — forces a new line:

Line three  
Line four (hard break)

A trailing backslash also makes a hard break:

Line five\
Line six (backslash hard break)

## Emphasis

**bold**, *italic*, ***bold + italic***, ~~struck~~, and `inline code`.

__underscore bold__, _underscore italic_, and **bold with _nested italic_**.

## Subscript and superscript

H~2~O is water. Einstein wrote E = mc^2^.

## Links and images

An [inline link](https://example.com), a [titled link](https://example.com "Optional title"), a bare URL https://example.com, a www autolink www.example.com, an extended email foo+bar@example.com, an <angle autolink@example.com>, and a reference link to [etabook][ref].

![A placeholder image](https://picsum.photos/seed/etabook/200 "Alt text")

[ref]: https://example.com "Reference title"

## Escaping

A backslash escapes markdown syntax: \*not italic\*, \#not a heading, and \|not a table separator\|.

## Raw HTML

Inline HTML passes through: this is <span style="color:red">red text</span> and <mark>an html mark</mark>.

<div class="box">A raw HTML block, passed through verbatim.</div>

## HTML entities

Entity references render as their glyphs: &copy; 2026, a non&nbsp;breaking space, &#35; and &#x1F600; — but `&copy;` inside code stays literal.

## Emoji

Shortcodes resolve to glyphs: :smile: :fire: :rocket: :heart: :tada: :zap:

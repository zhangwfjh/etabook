---
title: Obsidian Features Demo
tags: [sample, obsidian]
date: 2026-08-07
---

# Obsidian-Flavored Markdown

> Highlights, comments, tags, wiki-links, embeds, footnotes, and frontmatter.

## Highlight

This word is ==highlighted== in yellow, and so is ==this phrase==.

## Comments

This is visible. %%This is a hidden comment that renders nothing.%% Still visible.

## Tags

A flat #tag and a #nested/tag inside a paragraph.

## Wiki-links

Link to [[another-note]], an [[another-note|aliased link]], and a heading link [[another-note#Section]].

Within the current note: [[#Wiki-links]]. A nested-heading link: [[another-note#Parent#Sub]].

## Embeds

An embed of another note: ![[another-note]]

An image embed: ![[image.png]] — plus a heading embed ![[another-note#Section]] and a block embed ![[another-note#^block-id]].

## Footnotes

Markdown supports footnote references[^1] and a second one[^longnote].

Named footnotes[^note] work too, and a reference can sit mid-sentence[^inline] like this.

[^1]: This is the first footnote.

[^longnote]: Here is one with multiple paragraphs and code.

    Indent paragraphs to include them in the footnote.

[^note]: Named footnotes use word IDs.

[^inline]: A mid-sentence reference — the `[^...]` form of an inline footnote.

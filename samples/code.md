# Code Blocks

> Fenced code with syntax highlighting across languages.

## JavaScript

```js
// Fibonacci, memoized
const fib = (n, memo = new Map([[0, 0], [1, 1]])) => {
  if (!memo.has(n)) memo.set(n, fib(n - 1, memo) + fib(n - 2, memo))
  return memo.get(n)
}
console.log(fib(10))
```

## TypeScript

```ts
interface User { id: number; name: string }
function greet(user: User): string {
  return `Hello, ${user.name}`
}
```

## Python

```py
def quicksort(xs):
    if len(xs) <= 1:
        return xs
    pivot, rest = xs[0], xs[1:]
    return quicksort([r for r in rest if r < pivot]) + [pivot] + quicksort([r for r in rest if r >= pivot])
```

## JSON

```json
{
  "name": "etabook",
  "version": "0.1.0",
  "features": ["live-preview", "reading", "export"]
}
```

## Bash

```bash
#!/usr/bin/env bash
set -euo pipefail
echo "Building $(pwd)"
```

## CSS

```css
.callout-note {
  --accent: #4a9eff;
  border-left: 3px solid var(--accent);
}
```

## Plain (no language)

```
no info string — this block renders unhighlighted
```

## Nested fences

The outer fence uses four backticks, so the inner triple fence is content:

````md
```js
console.log("inner code block");
```
````

# MyCalculator

An engineering and scientific calculator that runs in the browser. It uses plain HTML, CSS and JavaScript, with no libraries and no build step.

## Files

| File | Purpose |
| --- | --- |
| `calculator.html` | Page structure: display, tabs and tool panels |
| `calculator.css` | Dark and light themes and responsive layout |
| `calculator.js` | All calculator logic |

## Run it

1. Download or clone the repository.
2. Keep the three files in the same folder.
3. Open `calculator.html` in any modern browser.

To publish it online, turn on GitHub Pages in the repository settings (Settings, then Pages) and open `/calculator.html` on your Pages URL.

## Features

**Calculator tab**
- Full operator precedence, so `2 + 3 × 4 = 14`, plus parentheses, `%`, `mod`, `±` and implicit multiplication (`2π`, `3(4+1)`)
- Powers and roots: `x²`, `x³`, `xʸ`, `√x`, `∛x`, `ʸ√x`, `1/x`, `10ˣ`, `eˣ`, `x!`
- Logs: `log`, `ln`, `log₂`
- Trig, inverse trig, hyperbolic and inverse hyperbolic functions (use the `2nd` key for inverses)
- DEG, RAD and GRAD angle modes
- Constants `π`, `e`, `φ` and `Ans` (the previous result)
- Engineering input: `EXP`, values like `6.02e23`, and SI prefixes typed after a number (`4.7k`, `10n`, `2.2µ`). Prefixes are `p n µ m k M G T`.
- Number display: normal, scientific and engineering notation, and a decimal/fraction toggle
- `nPr`, `nCr`, `gcd`, `lcm`, `floor`, `ceil`, `abs`, `sign`, `rand` and prime factorization (the `Factors` key)
- Memory: `MC`, `MR`, `M+`, `M−`, `MS`, with an `M` indicator
- Variables `A`, `B`, `C`, `X`, `Y` with `STO` and `RCL`
- History saved in `localStorage`. Click an entry to reuse it.
- Keyboard support: digits, operators, `Enter` for equals, `Backspace` to delete, `Esc` to clear

**Other tabs**
- **Statistics**: count, sum, mean, median, mode, min, max, range, and population and sample variance and standard deviation
- **Converter**: length, mass, temperature, area, volume, time, speed, pressure, energy, power and force
- **Electrical**: Ohm's law and power (fill any two of V, I, R, P), plus series and parallel resistance
- **Equation Solver**: linear and quadratic equations, including complex roots
- **Number Systems**: DEC, BIN, OCT and HEX conversion, and AND, OR, XOR, NOT, SHL and SHR

## How it works

- **Expression parser**: `script.js` has its own tokenizer and recursive-descent parser, so `eval()` is never used. Errors such as division by zero or an invalid logarithm show a friendly message.
- **Angle modes**: trig functions convert to and from radians based on the selected mode.
- **Rounding**: results are rounded to 12 significant digits to hide floating-point noise like `0.1 + 0.2`.
- **Equation solver**: it evaluates `f(x) = left - right` at three points to recover the coefficients of `ax² + bx + c`.

## Extending it

- **New calculator function**: add it to the `FN` object in `calculator.js`, then add a key string to the `SCI` list, for example `'sec|sec('`.
- **New unit**: add it to the matching category in the `UNITS` table, using its factor relative to the base unit.
- **New constant**: add it to the `CONST` object.

## Not included yet

- Matrix calculator
- Complex-number calculator
- Physics and geometry formula library

## Notes

- If you rename the files, update the `<link>` and `<script>` tags in `calculator.html` to match.
- The number-system bitwise operations use 32-bit unsigned results.

//! Small UI utilities: class joining and a safe calculator evaluator.

/// Join non-empty class fragments with spaces (the `cn` helper's job).
pub fn classes(parts: &[&str]) -> String {
    parts.iter().filter(|p| !p.is_empty()).copied().collect::<Vec<_>>().join(" ")
}

/// Evaluate an arithmetic expression safely (digits, `+ - * / ^ %`, parens,
/// decimals, unary minus). Replaces the JS `Function(...)` eval in the
/// calculator widget. Returns a JS-`String(value)`-like rendering.
pub fn evaluate(expr: &str) -> Result<String, ()> {
    // Match the original guard: only allow a small character set.
    if expr.trim().is_empty()
        || !expr.chars().all(|c| c.is_ascii_digit() || " +-*/().^%,".contains(c))
    {
        return Err(());
    }
    let tokens = tokenize(expr)?;
    let rpn = to_rpn(tokens)?;
    let value = eval_rpn(rpn)?;
    if !value.is_finite() {
        return Err(());
    }
    Ok(render_number(value))
}

fn render_number(v: f64) -> String {
    if v.fract() == 0.0 && v.abs() < 1e15 {
        format!("{}", v as i64)
    } else {
        format!("{v}")
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
enum Token {
    Num(f64),
    Op(char),
    LParen,
    RParen,
}

fn tokenize(s: &str) -> Result<Vec<Token>, ()> {
    let mut tokens = Vec::new();
    let chars: Vec<char> = s.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        match c {
            ' ' | ',' => i += 1,
            '0'..='9' | '.' => {
                let start = i;
                while i < chars.len() && (chars[i].is_ascii_digit() || chars[i] == '.') {
                    i += 1;
                }
                let num: f64 = chars[start..i].iter().collect::<String>().parse().map_err(|_| ())?;
                tokens.push(Token::Num(num));
            }
            '+' | '-' | '*' | '/' | '^' | '%' => {
                tokens.push(Token::Op(c));
                i += 1;
            }
            '(' => {
                tokens.push(Token::LParen);
                i += 1;
            }
            ')' => {
                tokens.push(Token::RParen);
                i += 1;
            }
            _ => return Err(()),
        }
    }
    Ok(tokens)
}

fn precedence(op: char) -> u8 {
    match op {
        '+' | '-' => 1,
        '*' | '/' | '%' => 2,
        '^' => 3,
        _ => 0,
    }
}

fn right_assoc(op: char) -> bool {
    op == '^'
}

/// Shunting-yard, with unary minus/plus folded into a leading zero operand.
fn to_rpn(tokens: Vec<Token>) -> Result<Vec<Token>, ()> {
    let mut output = Vec::new();
    let mut ops: Vec<Token> = Vec::new();
    let mut prev_was_value = false;

    for tok in tokens {
        match tok {
            Token::Num(_) => {
                output.push(tok);
                prev_was_value = true;
            }
            Token::Op(o) => {
                // Unary +/- at the start or after another operator / '('.
                if (o == '-' || o == '+') && !prev_was_value {
                    output.push(Token::Num(0.0));
                }
                while let Some(Token::Op(top)) = ops.last().copied() {
                    if precedence(top) > precedence(o)
                        || (precedence(top) == precedence(o) && !right_assoc(o))
                    {
                        output.push(ops.pop().unwrap());
                    } else {
                        break;
                    }
                }
                ops.push(tok);
                prev_was_value = false;
            }
            Token::LParen => {
                ops.push(tok);
                prev_was_value = false;
            }
            Token::RParen => {
                loop {
                    match ops.pop() {
                        Some(Token::LParen) => break,
                        Some(t) => output.push(t),
                        None => return Err(()),
                    }
                }
                prev_was_value = true;
            }
        }
    }
    while let Some(t) = ops.pop() {
        if matches!(t, Token::LParen | Token::RParen) {
            return Err(());
        }
        output.push(t);
    }
    Ok(output)
}

fn eval_rpn(rpn: Vec<Token>) -> Result<f64, ()> {
    let mut stack: Vec<f64> = Vec::new();
    for tok in rpn {
        match tok {
            Token::Num(n) => stack.push(n),
            Token::Op(o) => {
                let b = stack.pop().ok_or(())?;
                let a = stack.pop().ok_or(())?;
                stack.push(match o {
                    '+' => a + b,
                    '-' => a - b,
                    '*' => a * b,
                    '/' => a / b,
                    '%' => a % b,
                    '^' => a.powf(b),
                    _ => return Err(()),
                });
            }
            _ => return Err(()),
        }
    }
    if stack.len() == 1 {
        Ok(stack[0])
    } else {
        Err(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn evaluates_arithmetic() {
        assert_eq!(evaluate("2 + 2 * 3").unwrap(), "8");
        assert_eq!(evaluate("(2 + 2) * 3").unwrap(), "12");
        assert_eq!(evaluate("2 ^ 10").unwrap(), "1024");
        assert_eq!(evaluate("10 % 3").unwrap(), "1");
        assert_eq!(evaluate("-5 + 3").unwrap(), "-2");
        assert_eq!(evaluate("7 / 2").unwrap(), "3.5");
    }

    #[test]
    fn rejects_invalid() {
        assert!(evaluate("alert(1)").is_err());
        assert!(evaluate("").is_err());
        assert!(evaluate("2 +").is_err());
        assert!(evaluate("(1+2").is_err());
    }

    #[test]
    fn joins_classes() {
        assert_eq!(classes(&["a", "", "b"]), "a b");
    }
}

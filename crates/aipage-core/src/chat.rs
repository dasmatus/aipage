//! Pure chat heuristics ported from `hooks/useChat.ts`. The stateful pieces
//! (message list, typing flag) live in the sidebar's reactive state; this module
//! holds the decision logic so it can be unit-tested without a browser.

use crate::types::ContextAction;

/// Initial AI greeting (hardcoded Slovak, as in the original).
pub const INITIAL_GREETING: &str = "Ahoj! Ako ti môžem dnes pomôcť so štúdiom?";
/// Placeholder shown while a reply streams in.
pub const THINKING_PLACEHOLDER: &str = "Rozmýšľam...";
/// Placeholder shown while an image generates.
pub const IMAGE_PLACEHOLDER: &str = "Generujem obrázok...";

/// Heuristic: does this text look like a question/problem to solve?
/// Mirrors `isQuestionLike`.
pub fn is_question_like(text: &str) -> bool {
    let char_len = text.chars().count();

    if char_len < 1000 && (text.contains('?') || text.contains("Otázka")) {
        return true;
    }
    if text.contains("Vyberte správnu") || text.contains("Určite") {
        return true;
    }
    if starts_with_question_word(text) {
        return true;
    }
    if has_numbered_line(text) {
        return true;
    }
    false
}

/// Case-insensitive match of a leading question word followed by whitespace.
/// Equivalent to `/^(who|what|...|aké)\s/i`.
fn starts_with_question_word(text: &str) -> bool {
    const WORDS: &[&str] = &[
        "who", "what", "where", "when", "why", "how", "ako", "prečo", "kde", "kedy", "koľko",
        "čom", "aký", "aká", "aké",
    ];
    let lower = text.to_lowercase();
    for w in WORDS {
        if let Some(rest) = lower.strip_prefix(w) {
            if rest.chars().next().map(|c| c.is_whitespace()).unwrap_or(false) {
                return true;
            }
        }
    }
    false
}

/// True if any line starts with digits followed by a dot (`/^\d+\./m`).
fn has_numbered_line(text: &str) -> bool {
    text.lines().any(|line| {
        let digits = line.chars().take_while(|c| c.is_ascii_digit()).count();
        digits > 0 && line[digits..].starts_with('.')
    })
}

/// Build the system/user prompt for a context action. Mirrors
/// `generatePromptFromAction`.
pub fn generate_prompt_from_action(action: &str, last_page_context: &str) -> String {
    match action {
        "answer" | "answer_selection" => format!(
            "Context: ```{last_page_context}```\n\nQuestion: Based on the context above, answer the question or solve the problem. Answer in Slovak. Explain the solution step-by-step if needed."
        ),
        "explain_selection" => format!(
            "Context: ```{last_page_context}```\n\nTask: Explain this text to me in Slovak. Simplify complex concepts."
        ),
        "summarize_selection" => format!(
            "Context: ```{last_page_context}```\n\nTask: Summarize this text in Slovak."
        ),
        // "summarize" and any unknown action.
        _ => format!(
            "Context: ```{last_page_context}```\n\nTask: Summarize the key points of this page content in Slovak. Use bullet points."
        ),
    }
}

/// The AI message + action buttons to surface after a page/selection scan.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ContextPrompt {
    pub message: String,
    pub actions: Vec<ContextAction>,
}

fn action(label: &str, action: &str, primary: bool) -> ContextAction {
    ContextAction { label: label.to_string(), action: action.to_string(), primary }
}

/// Compute the message + actions for scanned content. Mirrors the body of
/// `handlePageContext` (the caller stores `content` as the last page context
/// and appends the returned message).
pub fn build_page_context(content: &str, is_selection: bool) -> ContextPrompt {
    let is_question = is_question_like(content);
    let char_len = content.chars().count();

    if is_selection {
        if is_question {
            let snippet: String = content.chars().take(100).collect();
            return ContextPrompt {
                message: format!(
                    "💡 Našiel som otázku vo výbere:\n\"{snippet}...\"\n\nAko chceš postupovať?"
                ),
                actions: vec![
                    action("Odpovedať", "answer_selection", true),
                    action("Vyhľadať web", "search_web", false),
                ],
            };
        }
        return ContextPrompt {
            message: format!("📝 Mám text výberu ({char_len} znakov). Čo s ním?"),
            actions: vec![
                action("Vysvetliť", "explain_selection", true),
                action("Zhrnúť", "summarize_selection", false),
            ],
        };
    }

    // Full page context.
    let mut actions = if is_question {
        vec![action("Odpovedať na otázku", "answer", true)]
    } else {
        vec![action("Zhrnúť obsah", "summarize", true)]
    };
    if is_question {
        actions.push(action("Zhrnúť stránku", "summarize", false));
    }

    ContextPrompt {
        message: format!(
            "✅ Načítal som obsah stránky ({char_len} znakov). Čo s ním mám spraviť?"
        ),
        actions,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_question_mark() {
        assert!(is_question_like("Koľko je 2 + 2?"));
        assert!(is_question_like("Toto je Otázka na teba"));
    }

    #[test]
    fn detects_exam_phrases() {
        assert!(is_question_like("Vyberte správnu odpoveď"));
        assert!(is_question_like("Určite hodnotu x"));
    }

    #[test]
    fn detects_question_words_and_numbered_lines() {
        assert!(is_question_like("Ako sa máš"));
        assert!(is_question_like("How does this work"));
        assert!(is_question_like("Intro\n1. First item\n2. Second"));
        assert!(!is_question_like("Just a plain statement of fact."));
    }

    #[test]
    fn long_text_with_qmark_is_not_question() {
        let long = format!("{}?", "a".repeat(1200));
        assert!(!is_question_like(&long));
    }

    #[test]
    fn prompt_actions_map_correctly() {
        let ctx = "PAGE";
        assert!(generate_prompt_from_action("answer", ctx).contains("step-by-step"));
        assert!(generate_prompt_from_action("explain_selection", ctx).contains("Simplify"));
        assert!(generate_prompt_from_action("summarize_selection", ctx).contains("Summarize this text"));
        assert!(generate_prompt_from_action("anything", ctx).contains("bullet points"));
        assert!(generate_prompt_from_action("answer", ctx).contains("```PAGE```"));
    }

    #[test]
    fn page_context_builds_question_actions() {
        let p = build_page_context("What is 2+2?", false);
        assert_eq!(p.actions.len(), 2);
        assert_eq!(p.actions[0].action, "answer");
        assert_eq!(p.actions[1].action, "summarize");

        let s = build_page_context("Some random selected prose.", true);
        assert_eq!(s.actions[0].action, "explain_selection");
    }
}

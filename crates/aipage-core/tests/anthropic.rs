//! Native tests for the pure parts of the Claude (Anthropic Messages API)
//! provider: URL and header shape, request-body building, response parsing
//! (text, refusal, tool_use blocks), the OpenAI→Anthropic tool conversion,
//! web-search tool selection and models-list pagination.

use aipage_core::providers::anthropic::{
    assistant_turn, extract_text, headers, message_body, model_of, models_from, models_url, messages_url,
    next_page_cursor, normalize_base_url, parse_tool_uses, refusal_message, stop_reason,
    supports_dynamic_filtering, text_blocks, tool_result_block, tools_from_openai, web_search_tool,
    ToolUse, API_VERSION, DEFAULT_BASE_URL, DEFAULT_MODEL, MAX_TOKENS,
};
use aipage_core::providers::{ModelInfo, SendOptions};
use serde_json::{json, Value};

fn opts(base: Option<&str>, model: Option<&str>) -> SendOptions {
    SendOptions { base_url: base.map(str::to_string), model_name: model.map(str::to_string), oauth: false }
}

#[test]
fn normalizes_base_urls() {
    assert_eq!(normalize_base_url(""), DEFAULT_BASE_URL);
    assert_eq!(normalize_base_url("   "), DEFAULT_BASE_URL);
    assert_eq!(normalize_base_url("https://api.anthropic.com/v1"), "https://api.anthropic.com");
    assert_eq!(normalize_base_url("https://api.anthropic.com/v1/"), "https://api.anthropic.com");
    assert_eq!(normalize_base_url("https://api.anthropic.com/"), "https://api.anthropic.com");
    assert_eq!(normalize_base_url(" https://gateway.example/anthropic "), "https://gateway.example/anthropic");
}

#[test]
fn builds_messages_and_models_urls() {
    assert_eq!(messages_url(&SendOptions::default()), "https://api.anthropic.com/v1/messages");
    assert_eq!(
        messages_url(&opts(Some("https://api.anthropic.com/v1"), None)),
        "https://api.anthropic.com/v1/messages"
    );
    assert_eq!(models_url(&SendOptions::default(), None), "https://api.anthropic.com/v1/models?limit=100");
    assert_eq!(
        models_url(&opts(Some("https://proxy.example/"), None), Some("claude-x")),
        "https://proxy.example/v1/models?limit=100&after_id=claude-x"
    );
}

#[test]
fn model_falls_back_to_default() {
    assert_eq!(model_of(&SendOptions::default()), DEFAULT_MODEL);
    assert_eq!(model_of(&SendOptions::with_model("")), DEFAULT_MODEL);
    assert_eq!(model_of(&SendOptions::with_model("claude-sonnet-5-5")), "claude-sonnet-5-5");
    assert_eq!(DEFAULT_MODEL, "claude-opus-5-5");
}

#[test]
fn headers_carry_key_and_version_not_bearer() {
    let h = headers("sk-ant-abc");
    assert_eq!(h.get("x-api-key").map(String::as_str), Some("sk-ant-abc"));
    assert_eq!(h.get("anthropic-version").map(String::as_str), Some(API_VERSION));
    assert_eq!(h.get("content-type").map(String::as_str), Some("application/json"));
    assert!(!h.contains_key("Authorization"));
    assert_eq!(API_VERSION, "2023-06-01");
}

#[test]
fn message_body_shape() {
    let messages = [json!({ "role": "user", "content": "hi" })];
    let body = message_body("claude-opus-5-5", "sys", &messages, None);
    assert_eq!(body["model"], "claude-opus-5-5");
    assert_eq!(body["max_tokens"], MAX_TOKENS);
    assert_eq!(body["system"], "sys");
    assert_eq!(body["messages"], json!(messages));
    assert!(body.get("tools").is_none(), "no tools key when none given");
    assert!(body.get("thinking").is_none(), "thinking is left to the model's default");
    assert!(body.get("tool_choice").is_none(), "forced tool choice is never sent");

    let tools = json!([{ "name": "t", "description": "d", "input_schema": { "type": "object" } }]);
    let with_tools = message_body("m", "s", &messages, Some(&tools));
    assert_eq!(with_tools["tools"], tools);
}

#[test]
fn joins_text_blocks_and_skips_other_kinds() {
    let resp = json!({
        "stop_reason": "end_turn",
        "content": [
            { "type": "thinking", "thinking": "" },
            { "type": "text", "text": "Hello " },
            { "type": "tool_use", "id": "toolu_1", "name": "x", "input": {} },
            { "type": "server_tool_use", "id": "srvtoolu_1", "name": "web_search", "input": { "query": "q" } },
            { "type": "text", "text": "world" }
        ]
    });
    assert_eq!(text_blocks(&resp), "Hello world");
    assert_eq!(extract_text(&resp), "Hello world");
    assert_eq!(stop_reason(&resp), Some("end_turn"));
}

#[test]
fn empty_content_is_no_response() {
    assert_eq!(text_blocks(&json!({ "content": [] })), "");
    assert_eq!(extract_text(&json!({ "content": [] })), "No response");
    assert_eq!(extract_text(&json!({})), "No response");
    assert_eq!(stop_reason(&json!({})), None);
}

#[test]
fn refusal_is_reported_with_details() {
    let plain = json!({ "stop_reason": "refusal", "content": [] });
    assert_eq!(refusal_message(&plain).as_deref(), Some("Claude declined this request."));
    let detailed = json!({
        "stop_reason": "refusal",
        "stop_details": { "type": "refusal", "category": "cyber", "explanation": "nope" },
        "content": []
    });
    assert_eq!(refusal_message(&detailed).as_deref(), Some("Claude declined this request (cyber): nope"));
    assert_eq!(refusal_message(&json!({ "stop_reason": "end_turn" })), None);
    assert_eq!(refusal_message(&json!({})), None);
}

#[test]
fn parses_tool_use_blocks_only() {
    let resp = json!({
        "stop_reason": "tool_use",
        "content": [
            { "type": "text", "text": "Let me look." },
            { "type": "tool_use", "id": "toolu_a", "name": "get_page_content", "input": {} },
            { "type": "server_tool_use", "id": "srvtoolu_b", "name": "web_search", "input": { "query": "x" } },
            { "type": "tool_use", "id": "toolu_c", "name": "fill_exam_answer", "input": { "value": "42" } }
        ]
    });
    let uses = parse_tool_uses(&resp);
    assert_eq!(
        uses,
        vec![
            ToolUse { id: "toolu_a".into(), name: "get_page_content".into(), input: json!({}) },
            ToolUse { id: "toolu_c".into(), name: "fill_exam_answer".into(), input: json!({ "value": "42" }) },
        ]
    );
    assert!(parse_tool_uses(&json!({ "content": [{ "type": "text", "text": "done" }] })).is_empty());
    assert!(parse_tool_uses(&json!({})).is_empty());
}

#[test]
fn tool_use_without_input_gets_empty_object() {
    let resp = json!({ "content": [{ "type": "tool_use", "id": "t", "name": "get_exam_question" }] });
    assert_eq!(parse_tool_uses(&resp)[0].input, json!({}));
}

#[test]
fn assistant_turn_echoes_full_content() {
    let content = json!([
        { "type": "thinking", "thinking": "" },
        { "type": "tool_use", "id": "t", "name": "n", "input": {} }
    ]);
    let turn = assistant_turn(&json!({ "content": content }));
    assert_eq!(turn["role"], "assistant");
    assert_eq!(turn["content"], content);
    assert_eq!(assistant_turn(&json!({}))["content"], json!([]));
}

#[test]
fn tool_result_blocks_mark_errors_only_when_set() {
    let ok = tool_result_block("toolu_a", "page text", false);
    assert_eq!(ok, json!({ "type": "tool_result", "tool_use_id": "toolu_a", "content": "page text" }));
    let err = tool_result_block("toolu_b", "boom", true);
    assert_eq!(err["is_error"], true);
    assert_eq!(err["tool_use_id"], "toolu_b");
}

#[test]
fn converts_openai_function_tools_to_anthropic_tools() {
    let openai = json!([
        { "type": "function", "function": { "name": "a", "description": "A", "parameters": { "type": "object", "properties": { "q": { "type": "string" } }, "required": ["q"] } } },
        { "type": "function", "function": { "name": "b" } },
        { "type": "web_search_preview" }
    ]);
    let tools = tools_from_openai(&openai);
    let arr = tools.as_array().expect("array");
    assert_eq!(arr.len(), 2);
    assert_eq!(arr[0]["name"], "a");
    assert_eq!(arr[0]["description"], "A");
    assert_eq!(arr[0]["input_schema"]["required"], json!(["q"]));
    assert!(arr[0].get("parameters").is_none());
    assert!(arr[0].get("type").is_none(), "custom tools carry no type field");
    assert_eq!(arr[1]["name"], "b");
    assert_eq!(arr[1]["input_schema"], json!({ "type": "object", "properties": {} }));
    assert_eq!(tools_from_openai(&json!({})), json!([]));
}

#[test]
fn picks_web_search_tool_variant_per_model() {
    for m in ["claude-opus-5-5", "claude-opus-5", "claude-opus-4-8", "claude-opus-4-7", "claude-opus-4-6", "claude-sonnet-5-5", "claude-sonnet-5", "claude-sonnet-4-6", "claude-fable-5-1", "claude-fable-5", "some-gateway-alias"] {
        assert!(supports_dynamic_filtering(m), "{m}");
        assert_eq!(web_search_tool(m)["type"], "web_search_20260209", "{m}");
    }
    for m in ["claude-haiku-4-5", "claude-haiku-4-5-20251001", "claude-opus-4-5", "claude-opus-4-5-20251101", "claude-sonnet-4-5", "claude-opus-4-1", "claude-sonnet-4-20250514", "claude-3-5-haiku-latest", "claude-3-7-sonnet-latest"] {
        assert!(!supports_dynamic_filtering(m), "{m}");
        assert_eq!(web_search_tool(m)["type"], "web_search_20250305", "{m}");
    }
    assert_eq!(web_search_tool(DEFAULT_MODEL)["name"], "web_search");
}

#[test]
fn parses_models_pages_and_cursor() {
    let page = json!({
        "data": [ { "id": "claude-opus-5-5", "display_name": "Claude Opus 5.5" }, { "display_name": "no-id" }, { "id": "claude-haiku-4-5" } ],
        "has_more": true,
        "first_id": "claude-opus-5-5",
        "last_id": "claude-haiku-4-5"
    });
    assert_eq!(
        models_from(&page),
        vec![
            ModelInfo { id: "claude-opus-5-5".into(), provider: "Claude (Anthropic)".into() },
            ModelInfo { id: "claude-haiku-4-5".into(), provider: "Claude (Anthropic)".into() },
        ]
    );
    assert_eq!(next_page_cursor(&page).as_deref(), Some("claude-haiku-4-5"));

    let last = json!({ "data": [], "has_more": false, "last_id": "claude-haiku-4-5" });
    assert!(models_from(&last).is_empty());
    assert_eq!(next_page_cursor(&last), None);
    assert_eq!(next_page_cursor(&json!({ "has_more": true })), None, "no last_id → stop");
    assert_eq!(next_page_cursor(&Value::Null), None);
}

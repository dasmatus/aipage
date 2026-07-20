//! Image generation (Ollama-SVG + SD WebUI). Mirrors `providers/imagegen.ts`.
//!
//! The Ollama-SVG path asks an OpenAI-compatible chat model (Ollama Cloud by
//! default; also works against local Ollama / LM Studio) for a self-contained
//! SVG and rasterizes it to PNG with the pure-Rust `resvg`/`tiny-skia` stack
//! (replacing the WASM ImageMagick dependency). SD WebUI returns base64 PNG
//! directly.

use std::collections::HashMap;

use serde_json::{json, Value};

use crate::providers::ollama_cloud::{auth_headers, chat_url};
use crate::providers::SendOptions;
use crate::proxy::{perform_request, post_json};

const SVG_SYSTEM_PROMPT: &str = "You are an SVG illustration generator. Given a description, respond with ONE complete, self-contained SVG document and nothing else.\nRules:\n- Output ONLY the <svg>...</svg> markup. No markdown fences, no commentary, no explanation.\n- Include an explicit viewBox plus width and height attributes.\n- Use only inline shapes, paths, gradients, and style attributes. No external images, fonts, scripts, or network references.";

/// Options for an image-generation request.
#[derive(Clone, Debug)]
pub struct ImageGenOptions {
    /// `"ollama-svg"` or `"sdwebui"`. Legacy `"claude-svg"` is treated as the svg path.
    pub provider: String,
    pub api_key: String,
    pub base_url: Option<String>,
    pub model: String,
    pub size: String,
}

/// A generated image plus an optional revised prompt.
#[derive(Clone, Debug)]
pub struct ImageResult {
    pub data_url: String,
    pub revised_prompt: Option<String>,
}

pub async fn generate_image(prompt: &str, options: &ImageGenOptions) -> Result<ImageResult, String> {
    if options.provider == "sdwebui" {
        // `options.baseUrl || 'http://localhost:7860'`: an empty string is falsy.
        let base = options
            .base_url
            .clone()
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| "http://localhost:7860".to_string());
        generate_sdwebui(prompt, &base).await
    } else {
        generate_ollama_svg(prompt, &options.api_key, options.base_url.as_deref().unwrap_or(""), &options.model, &options.size).await
    }
}

async fn generate_ollama_svg(prompt: &str, api_key: &str, base_url: &str, model: &str, size: &str) -> Result<ImageResult, String> {
    let model = if model.is_empty() { "gpt-oss:120b-cloud" } else { model };
    let opts = SendOptions { base_url: (!base_url.is_empty()).then_some(base_url.to_string()), model_name: Some(model.to_string()) };
    let body = json!({
        "model": model,
        "messages": [
            { "role": "system", "content": SVG_SYSTEM_PROMPT },
            { "role": "user", "content": format!("Create an SVG illustration of: {prompt}") }
        ],
        "stream": false,
    });
    let resp = post_json(&chat_url(&opts), &auth_headers(api_key), &body).await?;

    let text = resp
        .pointer("/choices/0/message/content")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();

    let svg = extract_svg(&text).ok_or("The model did not return a valid SVG document")?;
    let (width, height) = parse_size(size);
    let data_url = svg_to_png(&svg, width, height)?;
    Ok(ImageResult { data_url, revised_prompt: None })
}

async fn generate_sdwebui(prompt: &str, base_url: &str) -> Result<ImageResult, String> {
    let url = format!("{}/sdapi/v1/txt2img", base_url.trim_end_matches('/'));
    let mut headers = HashMap::new();
    headers.insert("Content-Type".to_string(), "application/json".to_string());
    let body = json!({ "prompt": prompt, "width": 512, "height": 512, "steps": 20, "cfg_scale": 7 });
    let data = perform_request(&url, "POST", &headers, Some(&body.to_string())).await?;
    let b64 = data
        .get("images")
        .and_then(Value::as_array)
        .and_then(|a| a.first())
        .and_then(Value::as_str)
        .ok_or("No image data from SD WebUI")?;
    Ok(ImageResult { data_url: format!("data:image/png;base64,{b64}"), revised_prompt: None })
}

/// Pull the first `<svg>…</svg>` block out of the model response, tolerating
/// markdown code fences. Mirrors `extractSvg`.
pub(crate) fn extract_svg(text: &str) -> Option<String> {
    let cleaned = text.replace("```svg", "").replace("```xml", "").replace("```html", "").replace("```", "");
    let lower = cleaned.to_lowercase();
    let start = lower.find("<svg")?;
    let end_rel = lower[start..].find("</svg>")?;
    let end = start + end_rel + "</svg>".len();
    Some(cleaned[start..end].to_string())
}

/// Parse a `WxH` size string, defaulting to 1024×1024. Mirrors `parseSize`.
pub(crate) fn parse_size(size: &str) -> (u32, u32) {
    let s = if size.is_empty() { "1024x1024" } else { size };
    let normalized = s.replace('×', "x");
    let mut parts = normalized.split('x');
    let w = parts.next().and_then(|p| p.trim().parse::<u32>().ok());
    let h = parts.next().and_then(|p| p.trim().parse::<u32>().ok());
    match (w, h) {
        (Some(w), Some(h)) if w > 0 && h > 0 => (w, h),
        _ => (1024, 1024),
    }
}

/// Rasterize an SVG to a PNG `data:` URL at the requested size.
fn svg_to_png(svg: &str, width: u32, height: u32) -> Result<String, String> {
    use resvg::tiny_skia;
    use resvg::usvg;

    let opt = usvg::Options::default();
    let tree = usvg::Tree::from_str(svg, &opt).map_err(|e| format!("invalid SVG: {e}"))?;

    let mut pixmap = tiny_skia::Pixmap::new(width, height).ok_or("invalid output size")?;

    // Scale the SVG's intrinsic size to fill the requested raster.
    let size = tree.size();
    let (sx, sy) = (width as f32 / size.width(), height as f32 / size.height());
    let transform = tiny_skia::Transform::from_scale(sx, sy);

    resvg::render(&tree, transform, &mut pixmap.as_mut());

    let png = pixmap.encode_png().map_err(|e| format!("PNG encode failed: {e}"))?;
    Ok(format!("data:image/png;base64,{}", base64_encode(&png)))
}

/// Standard padded base64 encoder.
fn base64_encode(input: &[u8]) -> String {
    const ALPHABET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(input.len().div_ceil(3) * 4);
    for chunk in input.chunks(3) {
        let b = [chunk[0], *chunk.get(1).unwrap_or(&0), *chunk.get(2).unwrap_or(&0)];
        let n = ((b[0] as u32) << 16) | ((b[1] as u32) << 8) | (b[2] as u32);
        out.push(ALPHABET[((n >> 18) & 0x3f) as usize] as char);
        out.push(ALPHABET[((n >> 12) & 0x3f) as usize] as char);
        out.push(if chunk.len() > 1 { ALPHABET[((n >> 6) & 0x3f) as usize] as char } else { '=' });
        out.push(if chunk.len() > 2 { ALPHABET[(n & 0x3f) as usize] as char } else { '=' });
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_svg_from_fenced_text() {
        let text = "Here you go:\n```svg\n<svg viewBox=\"0 0 10 10\"><rect/></svg>\n```\ndone";
        let svg = extract_svg(text).unwrap();
        assert!(svg.starts_with("<svg"));
        assert!(svg.ends_with("</svg>"));
        assert!(!svg.contains("```"));
    }

    #[test]
    fn parses_sizes() {
        assert_eq!(parse_size("1024x1024"), (1024, 1024));
        assert_eq!(parse_size("1792×1024"), (1792, 1024));
        assert_eq!(parse_size("bogus"), (1024, 1024));
        assert_eq!(parse_size(""), (1024, 1024));
    }

    #[test]
    fn renders_simple_svg_to_png_data_url() {
        let svg = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 10 10\" width=\"10\" height=\"10\"><rect width=\"10\" height=\"10\" fill=\"red\"/></svg>";
        let url = svg_to_png(svg, 20, 20).unwrap();
        assert!(url.starts_with("data:image/png;base64,"));
        assert!(url.len() > 50);
    }
}

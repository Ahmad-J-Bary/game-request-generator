use serde::{Deserialize, Serialize};
use specta::Type;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use reqwest::Url;
use std::str::FromStr;
#[derive(Serialize, Deserialize, Debug, Clone, Type)]
pub struct RepeaterResponse {
    pub status: u16,
    pub status_text: String,
    pub headers: std::collections::HashMap<String, String>,
    pub body: String,
    pub time_ms: u64,
}

pub struct RepeaterService;

impl RepeaterService {
    pub async fn send_raw_request(raw_request: &str) -> Result<RepeaterResponse, String> {
        let raw_request = raw_request.replace("\r\n", "\n");
        let mut parts = raw_request.splitn(2, "\n\n");
        let header_block = parts.next().unwrap_or("");
        let body_block = parts.next().unwrap_or("");

        let mut lines = header_block.lines();
        let first_line = lines.next().ok_or("Empty request")?;
        
        let mut method_url = first_line.split_whitespace();
        let method_str = method_url.next().unwrap_or("GET");
        let path = method_url.next().unwrap_or("/");
        
        let mut req_headers = HeaderMap::new();
        let mut host = if path.starts_with("http://") || path.starts_with("https://") {
            Url::parse(path)
                .ok()
                .and_then(|url| url.host_str().map(|host| {
                    if let Some(port) = url.port() {
                        format!("{}:{}", host, port)
                    } else {
                        host.to_string()
                    }
                }))
                .unwrap_or_default()
        } else {
            String::new()
        };
        
        for line in lines {
            let trimmed = line.trim();

            if let Some(authority) = trimmed.strip_prefix(":authority:") {
                if host.is_empty() {
                    host = authority.trim().to_string();
                }
                continue;
            }

            if let Some((k, v)) = line.split_once(':') {
                let k = k.trim();
                let v = v.trim();
                if k.eq_ignore_ascii_case("host") {
                    host = v.to_string();
                } else if host.is_empty() && (k.eq_ignore_ascii_case("origin") || k.eq_ignore_ascii_case("referer")) {
                    if let Ok(url) = Url::parse(v) {
                        if let Some(url_host) = url.host_str() {
                            host = if let Some(port) = url.port() {
                                format!("{}:{}", url_host, port)
                            } else {
                                url_host.to_string()
                            };
                        }
                    }
                }
                if let Ok(name) = HeaderName::from_str(k) {
                    if let Ok(value) = HeaderValue::from_str(v) {
                        req_headers.insert(name, value);
                    }
                }
            }
        }

        if host.is_empty() {
            return Err("Missing Host header in the request text. Add 'Host: api.example.com' or include a full URL / Origin header so the target server can be resolved.".to_string());
        }

        let scheme = if host.ends_with(":80") { "http" } else { "https" };
        let url = if path.starts_with("http") {
            path.to_string()
        } else {
            format!("{}://{}{}", scheme, host, path)
        };

        // Do not verify certs just in case people test on broken endpoints
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .danger_accept_invalid_certs(true)
            .build()
            .map_err(|e| format!("Failed to build client: {}", e))?;

        let method = reqwest::Method::from_str(method_str).map_err(|_| "Invalid HTTP Method")?;

        let mut request_builder = client.request(method, url).headers(req_headers);
            
        if !body_block.is_empty() {
            request_builder = request_builder.body(body_block.to_string());
        }

        let start_time = std::time::Instant::now();
        
        let response = match request_builder.send().await {
            Ok(r) => r,
            Err(e) => {
                let err_str = e.to_string();
                let clean_err = if err_str.contains("timed out") || err_str.contains("timeout") {
                    "Connection Timed Out: The server took too long to respond".to_string()
                } else if err_str.contains("dns") || err_str.contains("resolve") {
                    "DNS Resolution Failed: The host could not be resolved".to_string()
                } else {
                    format!("Network Error: {}", err_str)
                };
                return Err(clean_err);
            }
        };
        let elapsed = start_time.elapsed().as_millis() as u64;

        let status = response.status().as_u16();
        let status_text = response.status().canonical_reason().unwrap_or("Unknown").to_string();
        
        let mut resp_headers = std::collections::HashMap::new();
        for (k, v) in response.headers() {
            if let Ok(val) = v.to_str() {
                resp_headers.insert(k.as_str().to_string(), val.to_string());
            }
        }

        let body = response.text().await.unwrap_or_else(|_| "[Binary Stream or Unreadable Text]".to_string());

        Ok(RepeaterResponse {
            status,
            status_text,
            headers: resp_headers,
            body,
            time_ms: elapsed,
        })
    }
}

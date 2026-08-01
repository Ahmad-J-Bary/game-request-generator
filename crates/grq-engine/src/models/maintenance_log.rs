// crates/grq-engine/src/models/maintenance_log.rs

use serde::{Deserialize, Serialize};

/// سجل تتبع لعمليات الصيانة على البيانات القديمة: حذف/إعادة توكنة/تخطّي
/// لجلسات "سشن فقط" غير الصالحة، أو إعادة استخدام حدث حقيقي بدل إنشائها.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MaintenanceLog {
    pub id: i64,
    pub logged_at: String,
    pub action: String,
    pub branch_id: Option<i64>,
    pub level_id: Option<i64>,
    pub event_token: Option<String>,
    pub new_event_token: Option<String>,
    pub days_offset: Option<i32>,
    pub reason: Option<String>,
    pub detail: Option<String>,
}

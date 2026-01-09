// src-tauri/src/db/connection.rs

use sqlx::postgres::PgPoolOptions;
use sqlx::{Executor, Pool, Postgres};
use std::env;

pub struct Database {
    pub pool: Pool<Postgres>,
}

impl Database {
    pub async fn new() -> Result<Self, String> {
        let database_url =
            env::var("DATABASE_URL").map_err(|_| "DATABASE_URL not set in .env".to_string())?;

        // Parse the URL to correctly handle parameters for PgBouncer/Session Pooler
        // Note: We avoid statement caching for session poolers to prevent "prepared statement already exists" errors
        let mut connect_options: sqlx::postgres::PgConnectOptions = database_url
            .parse()
            .map_err(|e| format!("Invalid DATABASE_URL: {}", e))?;

        connect_options = connect_options
            .statement_cache_capacity(0)
            .ssl_mode(sqlx::postgres::PgSslMode::Require);

        let pool = PgPoolOptions::new()
            .max_connections(1) // Limit concurrency to avoid pooler conflicts temporarily
            .max_lifetime(std::time::Duration::from_secs(10)) // Recycle connections frequently
            .after_connect(|conn, _meta| {
                Box::pin(async move { conn.execute("DEALLOCATE ALL").await.map(|_| ()) })
            })
            .connect_with(connect_options)
            .await
            .map_err(|e| format!("Failed to create connection pool: {}", e))?;

        println!("Connected to Postgres at {}", database_url);

        Ok(Database { pool })
    }

    pub fn get_pool(&self) -> &Pool<Postgres> {
        &self.pool
    }
}

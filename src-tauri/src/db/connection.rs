// src-tauri/src/db/connection.rs

use sqlx::postgres::PgPoolOptions;
use sqlx::{Pool, Postgres};
use std::env;

pub struct Database {
    pub pool: Pool<Postgres>,
}

impl Database {
    pub async fn new() -> Result<Self, String> {
        let database_url =
            env::var("DATABASE_URL").map_err(|_| "DATABASE_URL not set in .env".to_string())?;

        let pool = PgPoolOptions::new()
            .max_connections(5)
            .connect(&database_url)
            .await
            .map_err(|e| format!("Failed to connect to database: {}", e))?;

        println!("Connected to Postgres at {}", database_url);

        Ok(Database { pool })
    }

    pub fn get_pool(&self) -> &Pool<Postgres> {
        &self.pool
    }
}

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use petgraph::graph::Graph;
use petgraph::algo::dijkstra;
use strsim::jaro_winkler;
use swc_ecma_parser::{lexer::Lexer, Parser, StringInput, Syntax};
use swc_common::{SourceMap, FileName};
use syn::{parse_str, Item, Expr, Stmt, Pat, Type};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlagiarismResult {
    pub similarity_score: f64,
    pub matched_submissions: Vec<MatchedSubmission>,
    pub risk_level: RiskLevel,
    pub analysis_time_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MatchedSubmission {
    pub submission_id: String,
    pub similarity_score: f64,
    pub matched_sections: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum RiskLevel {
    Low,
    Medium,
    High,
    Critical,
}

#[derive(Debug, Clone)]
pub struct CodeFingerprint {
    pub ast_hash: String,
    pub token_sequence: Vec<String>,
    pub structural_features: HashMap<String, u32>,
}

pub struct AntiCheatEngine {
    submission_database: HashMap<String, CodeFingerprint>,
}

impl AntiCheatEngine {
    pub fn new() -> Self {
        Self {
            submission_database: HashMap::new(),
        }
    }

    pub async fn check_plagiarism(
        &self,
        code: &str,
        language: &str,
        user_id: &str,
        challenge_id: &str,
    ) -> Result<PlagiarismResult, String> {
        let start_time = std::time::Instant::now();

        // Generate fingerprint for current submission
        let fingerprint = self.generate_fingerprint(code, language)?;

        // Compare against all submissions for this challenge
        let mut matches = Vec::new();
        let challenge_key = format!("{}:{}", challenge_id, language.to_lowercase());

        // In a real implementation, this would query a database
        // For now, we'll simulate with in-memory storage
        for (submission_key, stored_fingerprint) in &self.submission_database {
            if submission_key.starts_with(&challenge_key) && !submission_key.contains(user_id) {
                let similarity = self.calculate_similarity(&fingerprint, stored_fingerprint);
                if similarity > 0.3 { // Threshold for reporting
                    matches.push(MatchedSubmission {
                        submission_id: submission_key.clone(),
                        similarity_score: similarity,
                        matched_sections: vec!["full_code".to_string()], // Simplified
                    });
                }
            }
        }

        let max_similarity = matches.iter().map(|m| m.similarity_score).fold(0.0, f64::max);
        let risk_level = self.assess_risk_level(max_similarity);

        let result = PlagiarismResult {
            similarity_score: max_similarity,
            matched_submissions: matches,
            risk_level,
            analysis_time_ms: start_time.elapsed().as_millis() as u64,
        };

        Ok(result)
    }

    pub fn store_submission(
        &mut self,
        submission_id: &str,
        code: &str,
        language: &str,
    ) -> Result<(), String> {
        let fingerprint = self.generate_fingerprint(code, language)?;
        self.submission_database.insert(submission_id.to_string(), fingerprint);
        Ok(())
    }

    fn generate_fingerprint(&self, code: &str, language: &str) -> Result<CodeFingerprint, String> {
        match language.to_lowercase().as_str() {
            "typescript" | "javascript" => self.generate_typescript_fingerprint(code),
            "rust" => self.generate_rust_fingerprint(code),
            _ => Err(format!("Unsupported language for plagiarism detection: {}", language)),
        }
    }

    fn generate_typescript_fingerprint(&self, code: &str) -> Result<CodeFingerprint, String> {
        let cm = SourceMap::default();
        let fm = cm.new_source_file(FileName::Anon, code.to_string());

        let lexer = Lexer::new(
            Syntax::Typescript(Default::default()),
            Default::default(),
            StringInput::from(&*fm),
            None,
        );

        let mut parser = Parser::new_from(lexer);
        let module = parser.parse_module().map_err(|e| format!("Parse error: {:?}", e))?;

        let mut token_sequence = Vec::new();
        let mut structural_features = HashMap::new();

        // Extract tokens and structural features
        for item in &module.body {
            match item {
                swc_ecma_ast::ModuleItem::Stmt(stmt) => {
                    self.extract_typescript_tokens(stmt, &mut token_sequence, &mut structural_features);
                }
                swc_ecma_ast::ModuleItem::ModuleDecl(decl) => {
                    token_sequence.push("module_decl".to_string());
                    *structural_features.entry("module_decl".to_string()).or_insert(0) += 1;
                }
            }
        }

        let ast_hash = format!("{:x}", md5::compute(code));

        Ok(CodeFingerprint {
            ast_hash,
            token_sequence,
            structural_features,
        })
    }

    fn generate_rust_fingerprint(&self, code: &str) -> Result<CodeFingerprint, String> {
        let syntax_tree = parse_str::<syn::File>(code)
            .map_err(|e| format!("Parse error: {:?}", e))?;

        let mut token_sequence = Vec::new();
        let mut structural_features = HashMap::new();

        for item in &syntax_tree.items {
            self.extract_rust_tokens(item, &mut token_sequence, &mut structural_features);
        }

        let ast_hash = format!("{:x}", md5::compute(code));

        Ok(CodeFingerprint {
            ast_hash,
            token_sequence,
            structural_features,
        })
    }

    fn extract_typescript_tokens(
        &self,
        stmt: &swc_ecma_ast::Stmt,
        tokens: &mut Vec<String>,
        features: &mut HashMap<String, u32>,
    ) {
        match stmt {
            swc_ecma_ast::Stmt::Expr(expr_stmt) => {
                tokens.push("expr_stmt".to_string());
                *features.entry("expr_stmt".to_string()).or_insert(0) += 1;
                self.extract_typescript_expr_tokens(&expr_stmt.expr, tokens, features);
            }
            swc_ecma_ast::Stmt::Block(block) => {
                tokens.push("block".to_string());
                *features.entry("block".to_string()).or_insert(0) += 1;
                for stmt in &block.stmts {
                    self.extract_typescript_tokens(stmt, tokens, features);
                }
            }
            swc_ecma_ast::Stmt::If(if_stmt) => {
                tokens.push("if".to_string());
                *features.entry("if".to_string()).or_insert(0) += 1;
                self.extract_typescript_expr_tokens(&if_stmt.test, tokens, features);
            }
            swc_ecma_ast::Stmt::For(for_stmt) => {
                tokens.push("for".to_string());
                *features.entry("for".to_string()).or_insert(0) += 1;
            }
            swc_ecma_ast::Stmt::While(while_stmt) => {
                tokens.push("while".to_string());
                *features.entry("while".to_string()).or_insert(0) += 1;
            }
            _ => {
                tokens.push("other_stmt".to_string());
                *features.entry("other_stmt".to_string()).or_insert(0) += 1;
            }
        }
    }

    fn extract_typescript_expr_tokens(
        &self,
        expr: &swc_ecma_ast::Expr,
        tokens: &mut Vec<String>,
        features: &mut HashMap<String, u32>,
    ) {
        match expr {
            swc_ecma_ast::Expr::Call(call) => {
                tokens.push("call".to_string());
                *features.entry("call".to_string()).or_insert(0) += 1;
            }
            swc_ecma_ast::Expr::Ident(ident) => {
                tokens.push(format!("ident_{}", ident.sym));
                *features.entry("ident".to_string()).or_insert(0) += 1;
            }
            swc_ecma_ast::Expr::Lit(lit) => {
                tokens.push("literal".to_string());
                *features.entry("literal".to_string()).or_insert(0) += 1;
            }
            swc_ecma_ast::Expr::Assign(assign) => {
                tokens.push("assign".to_string());
                *features.entry("assign".to_string()).or_insert(0) += 1;
            }
            _ => {
                tokens.push("other_expr".to_string());
                *features.entry("other_expr".to_string()).or_insert(0) += 1;
            }
        }
    }

    fn extract_rust_tokens(
        &self,
        item: &syn::Item,
        tokens: &mut Vec<String>,
        features: &mut HashMap<String, u32>,
    ) {
        match item {
            Item::Fn(func) => {
                tokens.push("fn".to_string());
                *features.entry("fn".to_string()).or_insert(0) += 1;
                self.extract_rust_block_tokens(&func.block, tokens, features);
            }
            Item::Struct(strct) => {
                tokens.push("struct".to_string());
                *features.entry("struct".to_string()).or_insert(0) += 1;
            }
            Item::Enum(enm) => {
                tokens.push("enum".to_string());
                *features.entry("enum".to_string()).or_insert(0) += 1;
            }
            Item::Impl(impl_block) => {
                tokens.push("impl".to_string());
                *features.entry("impl".to_string()).or_insert(0) += 1;
            }
            _ => {
                tokens.push("other_item".to_string());
                *features.entry("other_item".to_string()).or_insert(0) += 1;
            }
        }
    }

    fn extract_rust_block_tokens(
        &self,
        block: &syn::Block,
        tokens: &mut Vec<String>,
        features: &mut HashMap<String, u32>,
    ) {
        for stmt in &block.stmts {
            match stmt {
                Stmt::Expr(expr, _) => {
                    self.extract_rust_expr_tokens(expr, tokens, features);
                }
                Stmt::Semi(expr, _) => {
                    self.extract_rust_expr_tokens(expr, tokens, features);
                }
                Stmt::Item(item) => {
                    self.extract_rust_tokens(item, tokens, features);
                }
                _ => {
                    tokens.push("other_stmt".to_string());
                    *features.entry("other_stmt".to_string()).or_insert(0) += 1;
                }
            }
        }
    }

    fn extract_rust_expr_tokens(
        &self,
        expr: &syn::Expr,
        tokens: &mut Vec<String>,
        features: &mut HashMap<String, u32>,
    ) {
        match expr {
            Expr::Call(call) => {
                tokens.push("call".to_string());
                *features.entry("call".to_string()).or_insert(0) += 1;
            }
            Expr::MethodCall(method_call) => {
                tokens.push("method_call".to_string());
                *features.entry("method_call".to_string()).or_insert(0) += 1;
            }
            Expr::Path(path) => {
                tokens.push("path".to_string());
                *features.entry("path".to_string()).or_insert(0) += 1;
            }
            Expr::Lit(lit) => {
                tokens.push("literal".to_string());
                *features.entry("literal".to_string()).or_insert(0) += 1;
            }
            Expr::Assign(assign) => {
                tokens.push("assign".to_string());
                *features.entry("assign".to_string()).or_insert(0) += 1;
            }
            Expr::If(if_expr) => {
                tokens.push("if".to_string());
                *features.entry("if".to_string()).or_insert(0) += 1;
                self.extract_rust_block_tokens(&if_expr.then_branch, tokens, features);
            }
            Expr::ForLoop(for_loop) => {
                tokens.push("for".to_string());
                *features.entry("for".to_string()).or_insert(0) += 1;
            }
            Expr::While(while_loop) => {
                tokens.push("while".to_string());
                *features.entry("while".to_string()).or_insert(0) += 1;
            }
            _ => {
                tokens.push("other_expr".to_string());
                *features.entry("other_expr".to_string()).or_insert(0) += 1;
            }
        }
    }

    fn calculate_similarity(&self, fp1: &CodeFingerprint, fp2: &CodeFingerprint) -> f64 {
        // AST hash similarity (exact match)
        let hash_similarity = if fp1.ast_hash == fp2.ast_hash { 1.0 } else { 0.0 };

        // Token sequence similarity using Jaro-Winkler distance
        let token_str1 = fp1.token_sequence.join(" ");
        let token_str2 = fp2.token_sequence.join(" ");
        let token_similarity = jaro_winkler(&token_str1, &token_str2);

        // Structural features similarity
        let structural_similarity = self.calculate_structural_similarity(&fp1.structural_features, &fp2.structural_features);

        // Weighted combination
        0.4 * hash_similarity + 0.4 * token_similarity + 0.2 * structural_similarity
    }

    fn calculate_structural_similarity(
        &self,
        features1: &HashMap<String, u32>,
        features2: &HashMap<String, u32>,
    ) -> f64 {
        let mut total_features = features1.keys().chain(features2.keys()).collect::<std::collections::HashSet<_>>();
        let mut similarity_sum = 0.0;
        let mut count = 0;

        for feature in total_features {
            let count1 = features1.get(feature).copied().unwrap_or(0) as f64;
            let count2 = features2.get(feature).copied().unwrap_or(0) as f64;

            if count1 > 0.0 || count2 > 0.0 {
                let similarity = 1.0 - (count1 - count2).abs() / (count1 + count2).max(1.0);
                similarity_sum += similarity;
                count += 1;
            }
        }

        if count == 0 {
            0.0
        } else {
            similarity_sum / count as f64
        }
    }

    fn assess_risk_level(&self, max_similarity: f64) -> RiskLevel {
        match max_similarity {
            s if s >= 0.9 => RiskLevel::Critical,
            s if s >= 0.7 => RiskLevel::High,
            s if s >= 0.5 => RiskLevel::Medium,
            _ => RiskLevel::Low,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_fingerprint_generation() {
        let engine = AntiCheatEngine::new();
        let code = r#"
            fn main() {
                println!("Hello, world!");
            }
        "#;

        let fingerprint = engine.generate_fingerprint(code, "rust").unwrap();
        assert!(!fingerprint.ast_hash.is_empty());
        assert!(!fingerprint.token_sequence.is_empty());
    }

    #[test]
    fn test_similarity_calculation() {
        let engine = AntiCheatEngine::new();

        let code1 = "fn test() { let x = 1; }";
        let code2 = "fn test() { let y = 1; }";

        let fp1 = engine.generate_fingerprint(code1, "rust").unwrap();
        let fp2 = engine.generate_fingerprint(code2, "rust").unwrap();

        let similarity = engine.calculate_similarity(&fp1, &fp2);
        assert!(similarity > 0.0 && similarity < 1.0);
    }
}
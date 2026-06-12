pub fn strip_priority_prefix(filename: &str) -> &str {
    let bytes = filename.as_bytes();
    let mut i = 0;
    while i < bytes.len() && bytes[i].is_ascii_digit() {
        i += 1;
    }
    if i > 0 && i < bytes.len() && bytes[i] == b'_' {
        &filename[i + 1..]
    } else {
        filename
    }
}

pub fn apply_priority_prefix(filename: &str, priority: i64) -> String {
    format!("{:03}_{}", priority, strip_priority_prefix(filename))
}

pub fn pak_filename(mod_name: &str) -> String {
    let trimmed = mod_name.trim();
    let mut result = String::new();
    let mut last_sep = false;
    for c in trimmed.chars() {
        if c.is_alphanumeric() || c == '_' || c == '.' || c == '-' {
            result.push(c);
            last_sep = false;
        } else if !last_sep {
            result.push('_');
            last_sep = true;
        }
    }
    let result = result.trim_matches('_');
    format!("{}.pak", result)
}

pub fn hash_filename(filename: &str) -> i64 {
    let mut h: i32 = 0;
    for c in filename.chars() {
        h = 31i32.wrapping_mul(h).wrapping_add(c as u32 as i32);
    }
    if h == 0 {
        -1
    } else {
        -(h.unsigned_abs() as i64)
    }
}

pub fn make_uid(file_id: Option<i64>, filename: &str) -> String {
    match file_id {
        Some(id) => id.to_string(),
        None => strip_priority_prefix(filename).to_string(),
    }
}

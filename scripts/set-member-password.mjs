#!/usr/bin/env node
/**
 * 为会员设置初始密码（管理员使用）
 * 用法: node scripts/set-member-password.mjs <phone_number> <password>
 * 需要环境变量: VITE_SUPABASE_URL, VITE_SUPABASE_SERVICE_ROLE_KEY 或 VITE_SUPABASE_PUBLISHABLE_KEY
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const [phone, password] = process.argv.slice(2);
if (!phone || !password) {
  console.log('Usage: node scripts/set-member-password.mjs <phone_number> <password>');
  process.exit(1);
}

if (password.length < 6) {
  console.error('Password must be at least 6 characters');
  process.exit(1);
}

const supabase = createClient(url, key);

async function main() {
  const { data: member, error: fetchErr } = await supabase
    .from('members')
    .select('id, member_code, phone_number')
    .eq('phone_number', phone.trim())
    .maybeSingle();

  if (fetchErr) {
    console.error('Error:', fetchErr.message);
    process.exit(1);
  }
  if (!member) {
    console.error('Member not found for phone:', phone);
    process.exit(1);
  }

  const { data, error } = await supabase.rpc('admin_set_member_initial_password', {
    p_member_id: member.id,
    p_new_password: password,
  });

  if (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }

  const result = data;
  if (!result?.success) {
    console.error('Failed:', result?.error || 'Unknown');
    process.exit(1);
  }

  console.log('Password set for', member.member_code, member.phone_number);
}

main();

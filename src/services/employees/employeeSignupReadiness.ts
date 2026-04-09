/**
 * 注册页等无 JWT 场景：通过数据表代理判断是否存在员工记录
 */
import { hasAnyEmployeeRows } from '@/api/employeeData';

/** 若返回 true 表示系统中已有至少一条员工记录（非首个注册账号） */
export async function hasAnyEmployeeRecordsForSignup(): Promise<boolean> {
  const rows = await hasAnyEmployeeRows();
  return Array.isArray(rows) && rows.length > 0;
}

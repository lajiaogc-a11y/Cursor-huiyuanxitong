/**
 * Member Auth API — 会员认证请求适配层
 *
 * 职责：封装 HTTP 请求细节，Service 层通过此文件间接调用后端。
 * 层级：API Client（不含业务逻辑）
 */
import { apiClient } from "@/lib/apiClient";

const PATHS = {
  SIGNIN: "/api/member-auth/signin",
  SET_PASSWORD: "/api/member-auth/set-password",
  info: (memberId: string) =>
    `/api/member-auth/info?member_id=${encodeURIComponent(memberId)}`,
} as const;

export const memberAuthApi = {
  signIn(phone: string, password: string) {
    return apiClient.post<unknown>(PATHS.SIGNIN, { phone: phone.trim(), password });
  },

  setPassword(oldPassword: string, newPassword: string) {
    return apiClient.post<unknown>(PATHS.SET_PASSWORD, {
      old_password: oldPassword,
      new_password: newPassword,
    });
  },

  getInfo(memberId: string) {
    return apiClient.get<unknown>(PATHS.info(memberId));
  },
};

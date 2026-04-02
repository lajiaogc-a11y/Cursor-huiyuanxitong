/** 会员收件箱未读数：通知列表页与首页 Bell 共享 */

let unreadCount = 0;
const listeners = new Set<() => void>();

export function getMemberInboxUnreadCount(): number {
  return unreadCount;
}

export function setMemberInboxUnreadCount(n: number): void {
  const next = Math.max(0, Math.floor(Number(n) || 0));
  if (next === unreadCount) return;
  unreadCount = next;
  listeners.forEach((fn) => {
    fn();
  });
}

export function subscribeMemberInboxUnreadCount(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

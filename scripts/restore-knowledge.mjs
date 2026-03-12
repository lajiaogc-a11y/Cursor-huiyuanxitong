#!/usr/bin/env node
/**
 * 公司文档（知识库）数据恢复说明
 *
 * 知识库数据包含：knowledge_categories、knowledge_articles、knowledge_read_status
 *
 * 恢复方式：使用完整恢复脚本（含知识库）
 *   node scripts/restore-full.mjs [备份ID]
 *
 * 获取备份ID：平台设置 → 数据备份 → 查看备份列表
 * 或运行：node scripts/check-backups.mjs
 *
 * 若无备份：需重新创建分类和文章
 */
console.log('公司文档恢复说明：');
console.log('');
console.log('1. 若有备份，执行：node scripts/restore-full.mjs [备份ID]');
console.log('2. 获取备份ID：node scripts/check-backups.mjs');
console.log('3. 若无备份：在 公司文档 页面重新添加分类和文章');

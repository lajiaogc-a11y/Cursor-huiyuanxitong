/**
 * 海报库 Service — 业务编排层
 *
 * 数据访问委托 repository.ts
 */
export {
  type TaskPosterRow,
  savePoster,
  getPosters,
  updatePoster,
  deletePoster,
} from './repository.js';

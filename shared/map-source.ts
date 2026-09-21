/**
 * 底图来源集中管理：前端地图与 Worker 的 CSP 使用同一处常量，
 * 便于换成自托管瓦片源时同步修改。
 */
export const mapTilesOrigin = "https://tiles.openfreemap.org";
export const mapStyleUrl = `${mapTilesOrigin}/styles/positron`;

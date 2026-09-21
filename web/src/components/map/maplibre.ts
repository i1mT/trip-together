import "maplibre-gl/dist/maplibre-gl.css";

/**
 * 惰性加载 MapLibre 及其样式：只有真正打开地图或生成海报时才请求，
 * 地图库与样式都不进入首屏包。
 */
export async function loadMapLibre() {
  return import("maplibre-gl");
}

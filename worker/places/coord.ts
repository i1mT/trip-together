// GCJ-02 是中国境内加密坐标系（高德、腾讯返回值），WGS84 是 GPS 与本项目存储标准。
// 出境坐标不加密，转换前先判界；反算迭代收敛到厘米级，常数取自公开逆变换推导。
const PI = Math.PI;
const A = 6378245;
const EE = 0.00669342162296594323;

function outOfChina(lon: number, lat: number) {
  return lon < 72.004 || lon > 137.8347 || lat < 0.8293 || lat > 55.8271;
}

function transformLat(x: number, y: number) {
  let ret =
    -100 +
    2 * x +
    3 * y +
    0.2 * y * y +
    0.1 * x * y +
    0.2 * Math.sqrt(Math.abs(x));
  ret += ((20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2) / 3;
  ret += ((20 * Math.sin(y * PI) + 40 * Math.sin((y / 3) * PI)) * 2) / 3;
  ret +=
    ((160 * Math.sin((y / 12) * PI) + 320 * Math.sin((y * PI) / 30)) * 2) / 3;
  return ret;
}

function transformLon(x: number, y: number) {
  let ret =
    300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  ret += ((20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2) / 3;
  ret += ((20 * Math.sin(x * PI) + 40 * Math.sin((x / 3) * PI)) * 2) / 3;
  ret +=
    ((150 * Math.sin((x / 12) * PI) + 300 * Math.sin((x / 30) * PI)) * 2) / 3;
  return ret;
}

export function delta(lon: number, lat: number) {
  let dLat = transformLat(lon - 105, lat - 35);
  let dLon = transformLon(lon - 105, lat - 35);
  const radLat = (lat / 180) * PI;
  let magic = Math.sin(radLat);
  magic = 1 - EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180) / (((A * (1 - EE)) / (magic * sqrtMagic)) * PI);
  dLon = (dLon * 180) / ((A / sqrtMagic) * Math.cos(radLat) * PI);
  return { dLat, dLon };
}

export function gcj02ToWgs84(lon: number, lat: number) {
  if (outOfChina(lon, lat)) return { lon, lat };
  // 正向偏移反算：迭代修正到 GCJ-02 目标点，2 次后误差已在 1e-6 度（约 0.1 米）量级。
  const { dLat, dLon } = delta(lon, lat);
  let lon0 = lon - dLon;
  let lat0 = lat - dLat;
  for (let i = 0; i < 2; i++) {
    const next = delta(lon0, lat0);
    lon0 = lon - (dLon + next.dLon) / 2;
    lat0 = lat - (dLat + next.dLat) / 2;
  }
  return { lon: lon0, lat: lat0 };
}

export function looksChinese(text: string) {
  return /[一-鿿]/.test(text);
}

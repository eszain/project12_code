// Tiny 3-vector / 3x3 / 2x2 helpers (enough for encounter geometry; no dependency needed).

export type V3 = [number, number, number];
export type M3 = [V3, V3, V3];
export type M2 = [[number, number], [number, number]];

export const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);
export const norm = (a: number[]) => Math.sqrt(dot(a, a));
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const unit = (a: V3): V3 => scale(a, 1 / norm(a));

export const mulMV = (m: M3, v: V3): V3 => [dot(m[0], v), dot(m[1], v), dot(m[2], v)];
export const transpose = (m: M3): M3 => [
  [m[0][0], m[1][0], m[2][0]],
  [m[0][1], m[1][1], m[2][1]],
  [m[0][2], m[1][2], m[2][2]],
];
export const mulMM = (a: M3, b: M3): M3 => {
  const bt = transpose(b);
  return a.map((row) => bt.map((col) => dot(row, col))) as M3;
};
export const addMM = (a: M3, b: M3): M3 => a.map((row, i) => row.map((x, j) => x + b[i][j])) as M3;

/** Symmetric 3x3 is positive definite iff all leading principal minors are > 0 (Sylvester). */
export function isPositiveDefinite3(m: M3): boolean {
  const d1 = m[0][0];
  const d2 = m[0][0] * m[1][1] - m[0][1] * m[1][0];
  const d3 =
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  return d1 > 0 && d2 > 0 && d3 > 0;
}

export const det2 = (m: M2) => m[0][0] * m[1][1] - m[0][1] * m[1][0];
export const inv2 = (m: M2): M2 => {
  const d = det2(m);
  return [
    [m[1][1] / d, -m[0][1] / d],
    [-m[1][0] / d, m[0][0] / d],
  ];
};

/** Eigen-decomposition of a symmetric 2x2: sorted descending, with the major axis angle (deg). */
export function eig2(m: M2): { major: number; minor: number; angleDeg: number } {
  const a = m[0][0];
  const b = m[0][1];
  const c = m[1][1];
  const mean = (a + c) / 2;
  const r = Math.hypot((a - c) / 2, b);
  const angle = 0.5 * Math.atan2(2 * b, a - c);
  return { major: Math.sqrt(Math.max(mean + r, 0)), minor: Math.sqrt(Math.max(mean - r, 0)), angleDeg: (angle * 180) / Math.PI };
}

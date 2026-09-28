export function approx(actual, expected, epsilon = 1e-6) {
  return Math.abs(actual - expected) <= epsilon;
}

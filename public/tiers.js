// 模型档位：相对价格与耗时均为模拟示意，仅用于展示“按环节选档”的成本意识。
export const price = {
  high: { label: "高配", cost: 5, time: 2.5 },
  light: { label: "轻量", cost: 1, time: 1 },
};

// 以“全部环节都用高配”为 100 的相对成本 / 耗时，按各环节的典型调用量加权。
export function estimate(stages, tiers) {
  const total = (pick, choose) =>
    stages.reduce((sum, s) => sum + s.weight * price[choose(s)][pick], 0);
  const result = {};
  for (const key of ["cost", "time"]) {
    result[key] =
      (total(key, (s) => tiers[s.id]) / total(key, () => "high")) * 100;
  }
  return result;
}

// 回归结论：轻量达到目标线、且与高配差距不大，才建议用轻量。
export function verdict({ light, high }, target = 90, maxGap = 3) {
  return light >= target && high - light <= maxGap ? "light" : "high";
}

// 输出校验：确定性的代码，不依赖模型。以下是“业界通用做法”的演示实现，不代表某个具体框架或当时的实现。

// 语法层：先标准解析；失败再做轻量修复（去代码块、前后多余文字、尾逗号、单引号），修复后仍失败则报错。
export function parseJson(raw) {
  const steps = [];
  try {
    return { ok: true, value: JSON.parse(raw), steps };
  } catch {
    /* 进入轻量修复 */
  }
  let text = raw.trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    text = fenced[1].trim();
    steps.push("去掉 markdown 代码块");
  }
  const start = text.search(/[{[]/);
  const end = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
  if (start > 0 || (end !== -1 && end < text.length - 1)) {
    if (start !== -1 && end > start) {
      text = text.slice(start, end + 1);
      steps.push("去掉前后多余文字");
    }
  }
  const noTrailing = text.replace(/,\s*([}\]])/g, "$1");
  if (noTrailing !== text) {
    text = noTrailing;
    steps.push("去掉尾逗号");
  }
  try {
    return { ok: true, value: JSON.parse(text), steps };
  } catch (error) {
    return { ok: false, error: `不是合法 JSON：${error.message}`, steps };
  }
}

// 结构层：对照字段配置生成的 schema（字段名、类型、枚举）。多余字段丢弃，缺失字段补 null。
export function schemaFrom(fields) {
  return Object.fromEntries(
    fields.map((f) => [f.name, { type: f.type ?? "string", enum: f.enum }]),
  );
}
export function checkStructure(value, schema, { array = false } = {}) {
  const issues = [];
  const rows = array ? value : [value];
  if (array !== Array.isArray(value)) {
    return {
      ok: false,
      error: array ? "应为记录数组" : "应为单个对象，不是数组",
      issues,
    };
  }
  const cleaned = [];
  for (const [i, row] of rows.entries()) {
    if (row === null || typeof row !== "object" || Array.isArray(row)) {
      return { ok: false, error: `第 ${i + 1} 条记录不是对象`, issues };
    }
    const out = {};
    for (const key of Object.keys(row))
      if (!(key in schema)) issues.push(`丢弃多余字段「${key}」`);
    for (const [name, rule] of Object.entries(schema)) {
      if (!(name in row)) {
        out[name] = null;
        issues.push(`缺失字段「${name}」按 null`);
        continue;
      }
      const v = row[name];
      if (v === null) {
        out[name] = null;
      } else if (rule.type === "number" && typeof v !== "number") {
        return {
          ok: false,
          error: `字段「${name}」应为数字，实际为${typeof v}（${JSON.stringify(v)}）`,
          issues,
        };
      } else if (rule.type === "string" && typeof v !== "string") {
        return {
          ok: false,
          error: `字段「${name}」应为字符串，实际为${typeof v}`,
          issues,
        };
      } else if (rule.enum && !rule.enum.includes(v)) {
        return {
          ok: false,
          error: `字段「${name}」不在枚举范围内：${JSON.stringify(v)}`,
          issues,
        };
      } else {
        out[name] = v;
      }
    }
    cleaned.push(out);
  }
  return { ok: true, value: array ? cleaned : cleaned[0], issues };
}

export function validateOutput(raw, schema, options) {
  const syntax = parseJson(raw);
  if (!syntax.ok)
    return {
      ok: false,
      stage: "语法层",
      error: syntax.error,
      steps: syntax.steps,
    };
  const structure = checkStructure(syntax.value, schema, options);
  if (!structure.ok)
    return {
      ok: false,
      stage: "结构层",
      error: structure.error,
      steps: syntax.steps,
    };
  return {
    ok: true,
    value: structure.value,
    steps: [...syntax.steps, ...structure.issues],
  };
}

// 失败后的容错：带错误信息让模型重试（限次）；仍失败则标记失败，不写脏数据。
// attempts 为每次调用的原始返回（演示用，真实系统由模型调用产生）。
export function runWithRetry(attempts, schema, options, maxRetries = 2) {
  const log = [];
  for (let i = 0; i < attempts.length && i <= maxRetries; i++) {
    const result = validateOutput(attempts[i], schema, options);
    log.push({ attempt: i + 1, result });
    if (result.ok) return { status: "ok", value: result.value, log };
  }
  return { status: "failed", value: null, log };
}

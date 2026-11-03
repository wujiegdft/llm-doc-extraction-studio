import {
  fields as textFields,
  documentText,
  sampleValues,
  tableFields,
  tableDocument,
  tableSample,
  budget,
  chunkFields,
  chunkDocs,
  chunkFinds,
  chunkSizes,
  catalogFor,
  catalogPageSize,
  funnelFields,
  funnelHits,
  funnelSizes,
  tierStages,
  tierRegression,
  evalTarget,
  evalFields,
  frontierRef,
  evalVersions,
  metricNotes,
  validateFields,
  badOutputs,
  nodes,
} from "./data.js";
import { estimate, price, verdict } from "./tiers.js";
import { runWithRetry, schemaFrom } from "./validate.js";
import {
  assembleChunkPrompt,
  assembleCoarsePrompt,
  assembleExtractPrompt,
  assemblePickPrompt,
  assemblePrompt,
  catalogEntry,
  coarseTemplate,
  extractTemplate,
  firstChunkTemplate,
  mergeChunk,
  nextChunkTemplate,
  pickTemplate,
  promptTemplate,
  tablePromptTemplate,
} from "./prompt.js";

const $ = (selector) => document.querySelector(selector);
document.querySelectorAll(".mark[data-left]").forEach((mark) => {
  mark.style.left = `${mark.dataset.left}%`;
});
const text = (selector, value) => ($(selector).textContent = value);

// ———— 03 提示词拼装演示（纯文本 / 表格两种模式） ————
const defaults = () => ({
  text: { fields: structuredClone(textFields), doc: documentText },
  table: {
    fields: structuredClone(tableFields.map((f) => ({ ...f }))),
    doc: tableDocument,
  },
});
let mode = "text";
let state = defaults();
const documentInput = $("#document-text");

function renderFields() {
  const fields = state[mode].fields;
  const container = $("#fields");
  container.replaceChildren();
  fields.forEach((field, index) => {
    const row = document.createElement("fieldset");
    const legend = document.createElement("legend");
    legend.textContent = `字段 ${index + 1}`;
    row.append(legend);
    const controls = document.createElement("div");
    controls.className = "field-controls";
    const selectLabel = document.createElement("label");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = field.enabled;
    checkbox.addEventListener("change", () => {
      field.enabled = checkbox.checked;
      update();
    });
    selectLabel.append(checkbox, " 参与抽取");
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove";
    remove.textContent = "删除";
    remove.setAttribute("aria-label", `删除字段 ${index + 1}`);
    remove.addEventListener("click", () => {
      fields.splice(index, 1);
      renderFields();
      update();
      const buttons = [...document.querySelectorAll(".remove")];
      (buttons[Math.min(index, buttons.length - 1)] || $("#add-field")).focus();
    });
    controls.append(selectLabel, remove);
    row.append(controls);
    for (const [key, label] of [
      ["name", "字段名"],
      ["meaning", "字段含义"],
      ["guidance", "取值说明"],
    ]) {
      const wrapper = document.createElement("label");
      wrapper.textContent = label;
      const input = document.createElement(
        key === "name" ? "input" : "textarea",
      );
      input.value = field[key];
      if (key !== "name") input.rows = 2;
      input.setAttribute("aria-label", `字段 ${index + 1}：${label}`);
      input.addEventListener("input", () => {
        field[key] = input.value;
        update();
      });
      wrapper.append(input);
      row.append(wrapper);
    }
    container.append(row);
  });
}

// 确定性转换规则：日期统一格式；金额统一为“元”的数值。
function convert(record, currentMode) {
  const out = { ...record };
  if (typeof out["发生日期"] === "string")
    out["发生日期"] = out["发生日期"].replace(
      /^(\d{4})年(\d{1,2})月(\d{1,2})日$/,
      (_, y, m, d) => `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`,
    );
  if (typeof out["金额"] === "string") {
    const number = Number(out["金额"].replace("万元", ""));
    out["金额"] = Number.isNaN(number)
      ? out["金额"]
      : Math.round(number * 10000);
  }
  return out;
}

function update() {
  const { fields, doc } = state[mode];
  const selected = fields.filter((field) => field.enabled);
  const names = selected.map((field) => field.name.trim());
  const status = $("#demo-status");
  const invalid =
    names.some((name) => !name) || new Set(names).size !== names.length;
  status.classList.toggle("error", invalid);
  if (invalid) {
    status.textContent =
      "请为已选字段填写非空且唯一的名称。修正前暂停生成提示词与结果，避免字段被覆盖。";
    text("#assembled-prompt", "等待有效的字段配置…");
    text("#raw-result", "等待有效的字段配置…");
    text("#converted-result", "等待有效的字段配置…");
    return;
  }
  text("#assembled-prompt", assemblePrompt(selected, doc, mode));
  const unchanged = doc === (mode === "text" ? documentText : tableDocument);
  const pick = (source) =>
    Object.fromEntries(
      names.map((name) => [
        name,
        unchanged && source && Object.hasOwn(source, name)
          ? source[name]
          : null,
      ]),
    );
  let raw;
  let converted;
  if (mode === "text") {
    raw = pick(sampleValues);
    converted = convert(raw, mode);
  } else {
    raw = unchanged ? tableSample.map(pick) : [pick(null)];
    converted = raw.map((row) => convert(row, mode));
  }
  text("#raw-result", JSON.stringify(raw, null, 2));
  text("#converted-result", JSON.stringify(converted, null, 2));
  const modeNote =
    mode === "table"
      ? unchanged
        ? `表格 ${raw.length} 行 → ${raw.length} 条记录；空单元格为 null。`
        : "文档已修改：模拟记录全部为 null，不执行真实抽取。"
      : unchanged
        ? "模拟值仅按预置字段名匹配，不理解字段说明；自定义字段为 null。"
        : "文档已修改：模拟值全部为 null，不执行真实抽取。";
  status.textContent = !names.length
    ? "未选择字段：提示词字段定义为空，结果为空结构。可勾选或添加字段继续。"
    : `已选 ${names.length} 个字段 · 提示词已实时更新。${modeNote}`;
}

function showMode() {
  const table = mode === "table";
  text("#doc-title", table ? "前置程序输出（含表格）" : "PDF 转出的文本");
  text(
    "#doc-hint",
    table
      ? "前置程序输出带表格格式（Markdown / HTML）的内容；字段说明里写“取哪一列”。"
      : "前置程序产物，不是大模型生成。",
  );
  text("#doc-tag", table ? "模拟表格" : "模拟文档");
  text(
    "#raw-title",
    table ? "LLM JSON 中间数据（多行记录）" : "LLM JSON 中间数据",
  );
  documentInput.value = state[mode].doc;
  document
    .querySelectorAll('input[name="mode"]')
    .forEach((radio) => (radio.checked = radio.value === mode));
  renderFields();
  update();
}

document.querySelectorAll('input[name="mode"]').forEach((radio) =>
  radio.addEventListener("change", () => {
    mode = radio.value;
    showMode();
  }),
);
$("#add-field").addEventListener("click", () => {
  state[mode].fields.push({
    name: "",
    meaning: "",
    guidance: "",
    enabled: true,
  });
  renderFields();
  update();
  $('#fields fieldset:last-child input:not([type="checkbox"])').focus();
});
$("#reset").addEventListener("click", () => {
  state = defaults();
  showMode();
});
documentInput.addEventListener("input", () => {
  state[mode].doc = documentInput.value;
  update();
});

// ———— 04 长文档分块迭代演示 ————
const chunkTotal = chunkDocs.length;
function runChunks() {
  const steps = [];
  let found = {};
  for (let index = 0; index < chunkTotal; index++) {
    const pending = chunkFields.filter((field) => !(field.name in found));
    if (!pending.length) break;
    const prompt = assembleChunkPrompt({
      index,
      total: chunkTotal,
      pending,
      found,
      text: chunkDocs[index],
    });
    const returned = Object.fromEntries(
      pending.map((field) => [
        field.name,
        chunkFinds[index][field.name] ?? null,
      ]),
    );
    const before = found;
    found = mergeChunk(found, returned);
    steps.push({
      index,
      prompt,
      pendingBefore: pending.map((field) => field.name),
      foundBefore: before,
      returned,
      found,
      pendingAfter: chunkFields.map((f) => f.name).filter((n) => !(n in found)),
    });
  }
  return steps;
}
const longSteps = runChunks();
const shortStep = (() => {
  const prompt = assemblePrompt(
    chunkFields.map((f) => ({ ...f, enabled: true })),
    documentText,
    "text",
  );
  const returned = Object.fromEntries(
    chunkFields.map((f) => [f.name, sampleValues[f.name] ?? null]),
  );
  return { prompt, returned, found: returned };
})();
let longMode = true;
let shown = 0;
let timer = null;

function stopPlay() {
  clearInterval(timer);
  timer = null;
  $("#chain-play").textContent = "自动播放";
}
function bar(id, usedK, scaleK) {
  const el = $(id);
  el.style.width = `${Math.min(100, (usedK / scaleK) * 100)}%`;
  el.parentElement.setAttribute("aria-valuenow", String(usedK));
}
function renderChain() {
  const steps = longMode ? longSteps : [shortStep];
  const step = shown ? steps[shown - 1] : null;
  const done = shown === steps.length;
  const scale = budget.longDoc;
  $("#chain-doc-label").textContent = longMode
    ? `全文约 ${budget.longDoc}K（超出 ${budget.used}K 预算）`
    : `全文约 ${budget.shortDoc}K（预算内）`;
  bar("#bar-doc", longMode ? budget.longDoc : budget.shortDoc, scale);
  $("#chain-turn-label").textContent = step
    ? longMode
      ? `第 ${step.index + 1} 块输入约 ${chunkSizes[step.index]}K`
      : `一次输入约 ${budget.shortDoc}K`
    : "尚未调用模型";
  bar(
    "#bar-turn",
    step ? (longMode ? chunkSizes[step.index] : budget.shortDoc) : 0,
    scale,
  );
  const chips = $("#chain-chunks");
  chips.replaceChildren();
  const items = longMode ? chunkDocs.map((_, i) => i) : [0];
  for (const i of items) {
    const li = document.createElement("li");
    let label = "待处理";
    if (!longMode) label = shown ? "已处理（一次抽取）" : "待处理";
    else if (i < shown) label = "已处理";
    else if (done && i >= steps.length) label = "跳过（字段已抽齐）";
    if (longMode && i === shown - 1) li.className = "current";
    if (label.startsWith("跳过")) li.className = "skipped";
    li.textContent = longMode ? `块 ${i + 1} · ${label}` : `全文 · ${label}`;
    chips.append(li);
  }
  text(
    "#chain-prompt",
    step
      ? step.prompt
      : "点击「单步」或「自动播放」，查看每一轮由代码拼出的提示词。",
  );
  text(
    "#chain-returned",
    step ? JSON.stringify(step.returned, null, 2) : "（模拟）等待调用",
  );
  text("#chain-record", step ? JSON.stringify(step.found, null, 2) : "{}");
  const all = chunkFields.map((f) => f.name);
  const pending = !step
    ? all
    : longMode
      ? step.pendingAfter
      : all.filter((n) => step.found[n] === null);
  text("#chain-pending", pending.length ? pending.join("、") : "无（已抽齐）");
  $("#chain-step").disabled = done;
  const stepNote = !step
    ? longMode
      ? `长文档模式：全文约 ${budget.longDoc}K，按段落切为 ${chunkTotal} 块，每块约 ${chunkSizes[0]}K。`
      : "短文档模式：全文加字段放得进预算，直接一次拼好并调用一次。"
    : done
      ? longMode
        ? steps.length < chunkTotal
          ? `第 ${steps.length} 块后字段已抽齐，提前结束，跳过后 ${chunkTotal - steps.length} 块。合并为一条记录。`
          : "所有块处理完毕，合并为一条记录；未抽到的字段为 null。"
        : "调用一次，结果写成一条记录。"
      : `第 ${step.index + 1} 轮完成：返回 → 代码合并 → 更新待抽字段 → 拼下一块提示词。`;
  text("#chain-status", stepNote);
}
function advance() {
  const steps = longMode ? longSteps : [shortStep];
  if (shown < steps.length) shown++;
  renderChain();
  if (shown >= steps.length) stopPlay();
}
$("#chain-step").addEventListener("click", () => {
  stopPlay();
  advance();
});
$("#chain-play").addEventListener("click", () => {
  if (timer) return stopPlay();
  if (shown >= (longMode ? longSteps.length : 1)) shown = 0;
  $("#chain-play").textContent = "暂停";
  renderChain();
  timer = setInterval(advance, 1800);
});
$("#chain-reset").addEventListener("click", () => {
  stopPlay();
  shown = 0;
  renderChain();
});
document.querySelectorAll('input[name="doc-length"]').forEach((radio) =>
  radio.addEventListener("change", () => {
    stopPlay();
    longMode = radio.value === "long";
    shown = 0;
    renderChain();
  }),
);

// ———— 表格定位漏斗：粗筛（分页）→ 精选 → 精抽 ————
let multiHit = false;
let funnelShown = 0;
let funnelTimer = null;
function funnelPlan() {
  const hits = multiHit ? funnelHits.multi : funnelHits.single;
  const catalog = catalogFor(multiHit);
  const pages = Math.ceil(catalog.length / catalogPageSize);
  const steps = [];
  for (let page = 1; page <= pages; page++) {
    const tables = catalog.slice(
      (page - 1) * catalogPageSize,
      page * catalogPageSize,
    );
    const pageHits = hits.filter((id) => tables.some((t) => t.id === id));
    const returned = Object.fromEntries(
      funnelFields.map((f) => [f.name, pageHits]),
    );
    steps.push({
      kind: "coarse",
      title: `粗筛 第 ${page} / ${pages} 页（表格 ${tables[0].id}–${tables.at(-1).id}）`,
      prompt: assembleCoarsePrompt({
        fields: funnelFields,
        tables,
        page,
        pages,
      }),
      returned,
      size: funnelSizes.coarsePage,
      note: pageHits.length
        ? `本页命中：表格 ${pageHits.join("、")}。`
        : "本页没有。",
    });
  }
  if (hits.length > 1) {
    const candidates = hits.map((id) => catalog.find((t) => t.id === id));
    steps.push({
      kind: "pick",
      title: "精选：多个表格命中，再问一遍",
      prompt: assemblePickPrompt({ fields: funnelFields, candidates }),
      returned: {
        选中表格: funnelHits.selected,
        理由: "（模拟）单位为万元、列头含“本期合计”，与字段含义一致。",
      },
      size: funnelSizes.pick,
      note: `候选 ${hits.join("、")}，选中表格 ${funnelHits.selected}。`,
    });
  }
  const table = catalog.find((t) => t.id === funnelHits.selected);
  steps.push({
    kind: "extract",
    title: `精抽：只把表格 ${table.id} 的完整内容交给模型`,
    prompt: assembleExtractPrompt({ fields: funnelFields, table }),
    returned: {
      业务收入合计: { 值: table.rows[0].at(-1), 单位: table.unit },
      业务成本合计: { 值: table.rows[1].at(-1), 单位: table.unit },
    },
    size: funnelSizes.extract,
    note: "结果带表格单位；元 / 万元的换算交给后续规则层。",
  });
  return steps;
}
let funnelSteps = funnelPlan();
function stopFunnelPlay() {
  clearInterval(funnelTimer);
  funnelTimer = null;
  $("#funnel-play").textContent = "自动播放";
}
function renderFunnel() {
  const step = funnelShown ? funnelSteps[funnelShown - 1] : null;
  const done = funnelShown === funnelSteps.length;
  const list = $("#funnel-steps");
  list.replaceChildren();
  funnelSteps.forEach((item, i) => {
    const li = document.createElement("li");
    li.textContent = item.title.split("（")[0];
    if (i === funnelShown - 1) li.className = "current";
    else if (i < funnelShown) li.className = "done";
    list.append(li);
  });
  text("#funnel-step-title", step ? step.title : "尚未开始");
  text(
    "#funnel-prompt",
    step
      ? step.prompt
      : "点击「单步」或「自动播放」，查看每一步由代码拼出的提示词。",
  );
  text(
    "#funnel-returned",
    step ? JSON.stringify(step.returned, null, 2) : "（模拟）等待调用",
  );
  const found = funnelSteps
    .slice(0, funnelShown)
    .filter(
      (item) =>
        item.kind === "coarse" && Object.values(item.returned)[0].length,
    )
    .flatMap((item) => Object.values(item.returned)[0]);
  const last = funnelSteps.at(-1);
  text(
    "#funnel-hit",
    done
      ? JSON.stringify(last.returned, null, 2)
      : found.length
        ? `已命中候选表格：${[...new Set(found)].join("、")}`
        : "尚无命中",
  );
  $("#funnel-step").disabled = done;
  text(
    "#funnel-status",
    step
      ? `${step.note}（页间无依赖，粗筛各页可并行，这里按顺序演示。）`
      : `约 100 个表格，每 ${catalogPageSize} 页问一次，共 ${funnelSteps.filter((x) => x.kind === "coarse").length} 次。`,
  );
  // 输入大小对比：全塞进去 vs 漏斗每一步
  const rows = [
    ["全部表格塞进一次提示词", funnelSizes.allTables, "over"],
    ["粗筛：每页 20 个目录项（每次）", funnelSizes.coarsePage, ""],
    ["精选：候选目录项", funnelSizes.pick, ""],
    ["精抽：选中表格完整内容", funnelSizes.extract, ""],
  ];
  const max = funnelSizes.allTables;
  const box = $("#funnel-sizes");
  box.replaceChildren();
  for (const [label, size, cls] of rows) {
    const row = document.createElement("div");
    row.className = "size-row";
    const name = document.createElement("span");
    name.textContent = `${label} · 约 ${size}K`;
    const meter = document.createElement("div");
    meter.className = `meter ${cls}`;
    meter.setAttribute("role", "progressbar");
    meter.setAttribute("aria-label", label);
    meter.setAttribute("aria-valuemin", "0");
    meter.setAttribute("aria-valuemax", String(max));
    meter.setAttribute("aria-valuenow", String(size));
    const fill = document.createElement("i");
    fill.style.width = `${Math.max(1.5, (size / max) * 100)}%`;
    meter.append(fill);
    row.append(name, meter);
    box.append(row);
  }
}
function advanceFunnel() {
  if (funnelShown < funnelSteps.length) funnelShown++;
  renderFunnel();
  if (funnelShown >= funnelSteps.length) stopFunnelPlay();
}
$("#funnel-step").addEventListener("click", () => {
  stopFunnelPlay();
  advanceFunnel();
});
$("#funnel-play").addEventListener("click", () => {
  if (funnelTimer) return stopFunnelPlay();
  if (funnelShown >= funnelSteps.length) funnelShown = 0;
  $("#funnel-play").textContent = "暂停";
  renderFunnel();
  funnelTimer = setInterval(advanceFunnel, 1500);
});
$("#funnel-reset").addEventListener("click", () => {
  stopFunnelPlay();
  funnelShown = 0;
  renderFunnel();
});
$("#multi-hit").addEventListener("change", (event) => {
  stopFunnelPlay();
  multiHit = event.target.checked;
  funnelSteps = funnelPlan();
  funnelShown = 0;
  renderFunnel();
});

// ———— 08 模型档位：按环节选高配 / 轻量（模拟） ————
const actualTiers = () =>
  Object.fromEntries(tierStages.map((s) => [s.id, s.tier]));
let tiers = actualTiers();
let modelVersion = "old";
const SVG_NS = "http://www.w3.org/2000/svg";
// 流程图节点对应的环节：分块与短文档共用“LLM 抽取”节点，取两者中较高的档位展示。
function nodeTier(nodeKey) {
  const ids = tierStages.filter((s) => s.node === nodeKey).map((s) => s.id);
  if (!ids.length) return null;
  return ids.some((id) => tiers[id] === "high") ? "high" : "light";
}
function renderBadges() {
  document.querySelectorAll("#flow [data-node]").forEach((g) => {
    const tier = nodeTier(g.dataset.node);
    g.querySelector(".tier-badge")?.remove();
    g.querySelector(".tier-mark")?.remove();
    if (!tier) return;
    const rect = g.querySelector("rect");
    const right = Number(rect.getAttribute("width")) - 10;
    // 实心圆点 = 高配，空心圆点 = 轻量
    const mark = document.createElementNS(SVG_NS, "circle");
    mark.setAttribute("class", `tier-mark ${tier}`);
    mark.setAttribute("cx", String(right - 34));
    mark.setAttribute("cy", "18");
    mark.setAttribute("r", "3.5");
    mark.setAttribute("stroke-width", "1.2");
    g.append(mark);
    const badge = document.createElementNS(SVG_NS, "text");
    badge.setAttribute("class", `tier-badge ${tier}`);
    badge.setAttribute("x", String(right));
    badge.setAttribute("y", "22");
    badge.textContent = price[tier].label;
    g.append(badge);
    const base = g.getAttribute("aria-label").split("，档位")[0];
    g.setAttribute("aria-label", `${base}，档位：${price[tier].label}`);
  });
}
function renderTiers() {
  const rows = $("#tier-rows");
  rows.replaceChildren();
  for (const stage of tierStages) {
    const reg = tierRegression[modelVersion][stage.id];
    const suggest = verdict(reg);
    const tr = document.createElement("tr");
    const cell = (node) => {
      const td = document.createElement("td");
      td.append(node);
      tr.append(td);
      return td;
    };
    cell(document.createTextNode(stage.name));
    const select = document.createElement("select");
    select.setAttribute("aria-label", `${stage.name}的模型档位`);
    for (const key of ["light", "high"]) {
      const option = new Option(
        price[key].label,
        key,
        false,
        tiers[stage.id] === key,
      );
      select.append(option);
    }
    select.addEventListener("change", () => {
      tiers[stage.id] = select.value;
      renderTiers();
      renderBadges();
    });
    cell(select);
    cell(document.createTextNode(stage.reason));
    cell(document.createTextNode(`${reg.light}%`));
    cell(document.createTextNode(`${reg.high}%`));
    const note = document.createElement("span");
    note.className = suggest === tiers[stage.id] ? "pass" : "fail";
    note.textContent =
      suggest === tiers[stage.id]
        ? `建议${price[suggest].label}（与当前一致）`
        : `建议${price[suggest].label}（与当前不同）`;
    cell(note);
    rows.append(tr);
  }
  const now = estimate(tierStages, tiers);
  const meters = $("#tier-meters");
  meters.replaceChildren();
  for (const [label, value, key] of [
    ["相对成本", now.cost, "cost"],
    ["相对耗时", now.time, "time"],
  ]) {
    const row = document.createElement("div");
    row.className = "size-row";
    const name = document.createElement("span");
    name.textContent = `${label} · 约 ${value.toFixed(0)}`;
    const meter = document.createElement("div");
    meter.className = "meter";
    meter.setAttribute("role", "progressbar");
    meter.setAttribute("aria-label", `${label}（模拟，全部高配为 100）`);
    meter.setAttribute("aria-valuemin", "0");
    meter.setAttribute("aria-valuemax", "100");
    meter.setAttribute("aria-valuenow", value.toFixed(0));
    const fill = document.createElement("i");
    fill.style.width = `${Math.max(1.5, value)}%`;
    meter.append(fill);
    row.append(name, meter);
    meters.append(row);
  }
  const high = tierStages
    .filter((s) => tiers[s.id] === "high")
    .map((s) => s.name);
  text(
    "#tier-note",
    `当前高配环节：${high.length ? high.join("、") : "无"}。成本与耗时按各环节典型调用量加权，仅为模拟示意。`,
  );
}
document.querySelectorAll('input[name="model-version"]').forEach((radio) =>
  radio.addEventListener("change", () => {
    modelVersion = radio.value;
    renderTiers();
  }),
);
$("#tier-apply").addEventListener("click", () => {
  for (const stage of tierStages)
    tiers[stage.id] = verdict(tierRegression[modelVersion][stage.id]);
  renderTiers();
  renderBadges();
});
$("#tier-reset").addEventListener("click", () => {
  tiers = actualTiers();
  renderTiers();
  renderBadges();
});

// ———— 09 提示词验证：版本对比（模拟示意） ————
let evalVersion = "v3";
function renderEval() {
  const version = evalVersions.find((v) => v.id === evalVersion);
  text("#eval-change", `${version.label}：${version.change}`);
  const rows = $("#eval-rows");
  rows.replaceChildren();
  let reached = 0;
  for (const field of evalFields) {
    const value = version.fields[field];
    const ok = value >= evalTarget.min;
    if (ok) reached++;
    const tr = document.createElement("tr");
    const td = (child) => {
      const cell = document.createElement("td");
      cell.append(child);
      tr.append(cell);
    };
    td(document.createTextNode(field));
    const wrap = document.createElement("div");
    const meter = document.createElement("div");
    meter.className = "eval-meter";
    meter.setAttribute("role", "progressbar");
    meter.setAttribute("aria-label", `${field}准确率（模拟）`);
    meter.setAttribute("aria-valuemin", "0");
    meter.setAttribute("aria-valuemax", "100");
    meter.setAttribute("aria-valuenow", String(value));
    const fill = document.createElement("i");
    fill.className = ok ? "ok" : "";
    fill.style.width = `${value}%`;
    const band = document.createElement("b");
    band.className = "band";
    band.style.left = `${evalTarget.min}%`;
    band.style.width = `${evalTarget.max - evalTarget.min}%`;
    meter.append(fill, band);
    const label = document.createElement("span");
    label.className = "eval-value";
    label.textContent = `${value}%`;
    wrap.className = "eval-cell";
    wrap.append(meter, label);
    td(wrap);
    td(document.createTextNode(`${frontierRef[field]}%`));
    td(document.createTextNode(`${frontierRef[field] - value} 个百分点`));
    const mark = document.createElement("span");
    mark.className = ok ? "pass" : "fail";
    mark.textContent = ok ? "达到目标线" : `低于 ${evalTarget.min}%`;
    td(mark);
    rows.append(tr);
  }
  const all = reached === evalFields.length;
  text(
    "#eval-summary",
    all
      ? `模拟：${version.label} 在全部字段达到目标线（${evalTarget.min}%–${evalTarget.max}%），可上线。`
      : `模拟：${version.label} 有 ${evalFields.length - reached} 个字段低于 ${evalTarget.min}%，不达标，继续改提示词。`,
  );
  const grid = $("#eval-metrics");
  grid.replaceChildren();
  const index = evalVersions.indexOf(version);
  const prev = evalVersions[index - 1];
  for (const [name, note] of Object.entries(metricNotes)) {
    const value = version.metrics[name];
    const box = document.createElement("div");
    box.className = "metric";
    const title = document.createElement("span");
    title.textContent = name;
    const big = document.createElement("strong");
    big.textContent = `${value}${note.unit}`;
    box.append(title, big);
    if (prev) {
      const diff = value - prev.metrics[name];
      const better = note.better === "high" ? diff > 0 : diff < 0;
      const delta = document.createElement("em");
      delta.className = diff === 0 ? "" : better ? "pass" : "fail";
      delta.textContent = `较 ${prev.id} ${diff > 0 ? "+" : ""}${diff}`;
      big.append(delta);
    }
    const hint = document.createElement("small");
    hint.textContent = `${note.hint}（模拟）`;
    box.append(hint);
    grid.append(box);
  }
}
document.querySelectorAll('input[name="eval-version"]').forEach((radio) =>
  radio.addEventListener("change", () => {
    evalVersion = radio.value;
    renderEval();
  }),
);

// ———— 07 输出校验与容错（模拟） ————
const badSelect = $("#bad-output");
for (const item of badOutputs)
  badSelect.append(new Option(item.label, item.id));
function renderValidation() {
  const item = badOutputs.find((x) => x.id === badSelect.value);
  const run = runWithRetry(item.raws, schemaFrom(validateFields));
  const list = $("#validation-attempts");
  list.replaceChildren();
  item.raws.forEach((raw, i) => {
    const li = document.createElement("li");
    const step = run.log[i];
    const head = document.createElement("span");
    head.className = "small-label";
    head.textContent =
      `第 ${i + 1} 次调用` + (i ? "（带上一次的错误信息）" : "");
    const pre = document.createElement("pre");
    pre.textContent = raw;
    const verdictEl = document.createElement("p");
    verdictEl.className = step ? (step.result.ok ? "pass" : "fail") : "hint";
    verdictEl.textContent = !step
      ? "未调用（前面已通过）"
      : step.result.ok
        ? "校验通过" +
          (step.result.steps.length ? `：${step.result.steps.join("；")}` : "")
        : `${step.result.stage}失败：${step.result.error}`;
    li.append(head, pre, verdictEl);
    list.append(li);
  });
  text(
    "#validation-result",
    run.status === "ok"
      ? JSON.stringify(run.value, null, 2)
      : "该条记录标记为失败 → 进入人工处理 / 告警\n（不写入数据库）",
  );
  text("#validation-note", `${item.note}（模拟示意）`);
}
badSelect.addEventListener("change", renderValidation);

// ———— 02 流程图 ————
function selectNode(node) {
  document
    .querySelectorAll("[data-node]")
    .forEach((element) =>
      element.setAttribute(
        "aria-pressed",
        String(element.dataset.node === node),
      ),
    );
  const data = nodes[node];
  const detail = $("#node-detail");
  detail.replaceChildren();
  for (const [tag, value] of [
    ["span", data.kind],
    ["h3", data.title],
    ["p", data.description],
  ]) {
    const element = document.createElement(tag);
    element.textContent = value;
    if (tag === "span") element.className = "small-label";
    detail.append(element);
  }
  const dl = document.createElement("dl");
  for (const [label, value] of [
    ["输入", data.input],
    ["输出", data.output],
  ]) {
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = label;
    dd.textContent = value;
    dl.append(dt, dd);
  }
  detail.append(dl);
}
document.querySelectorAll("[data-node]").forEach((element) => {
  element.addEventListener("click", () => selectNode(element.dataset.node));
  element.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectNode(element.dataset.node);
    }
  });
});

// ———— 05 模板 ————
text("#prompt-template", promptTemplate);
text("#table-template", tablePromptTemplate);
text("#coarse-template", coarseTemplate);
text("#pick-template", pickTemplate);
text("#extract-template", extractTemplate);
text("#first-chunk-template", firstChunkTemplate);
text("#next-chunk-template", nextChunkTemplate);

showMode();
renderChain();
renderFunnel();
renderTiers();
renderBadges();
renderEval();
renderValidation();
selectNode("assembly");

import {
  fields as initialFields,
  documentText,
  sampleValues,
  nodes,
} from "./data.js";
import { assemblePrompt, promptTemplate } from "./prompt.js";

let fields = structuredClone(initialFields);
const $ = (selector) => document.querySelector(selector);
const documentInput = $("#document-text");
documentInput.value = documentText;
$("#prompt-template").textContent = promptTemplate;

function renderFields() {
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

function update() {
  const selected = fields.filter((field) => field.enabled);
  const names = selected.map((field) => field.name.trim());
  const invalid =
    names.some((name) => !name) || new Set(names).size !== names.length;
  const status = $("#demo-status");
  status.classList.toggle("error", invalid);
  if (invalid) {
    status.textContent =
      "请为已选字段填写非空且唯一的名称。修正前暂停生成提示词与结果，避免字段被覆盖。";
    $("#assembled-prompt").textContent = "等待有效的字段配置…";
    $("#raw-result").textContent = $("#converted-result").textContent =
      "等待有效的字段配置…";
    return;
  }
  $("#assembled-prompt").textContent = assemblePrompt(
    selected,
    documentInput.value,
  );
  const unchanged = documentInput.value === documentText;
  const raw = Object.fromEntries(
    names.map((name) => [
      name,
      unchanged && Object.hasOwn(sampleValues, name)
        ? sampleValues[name]
        : null,
    ]),
  );
  const converted = { ...raw };
  if (raw["发生日期"] !== undefined && raw["发生日期"] !== null)
    converted["发生日期"] = raw["发生日期"].replace(
      /^(\d{4})年(\d{1,2})月(\d{1,2})日$/,
      (_, y, m, d) => `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`,
    );
  if (raw["金额"] !== undefined && raw["金额"] !== null)
    converted["金额"] = Number(raw["金额"].replace("万元", "")) * 10000;
  $("#raw-result").textContent = JSON.stringify(raw, null, 2);
  $("#converted-result").textContent = JSON.stringify(converted, null, 2);
  status.textContent = !names.length
    ? "未选择字段：提示词字段定义为空，结果为 {}。可勾选或添加字段继续。"
    : `已选 ${names.length} 个字段 · 提示词已实时更新。${unchanged ? "模拟值仅按预置字段名匹配，不理解字段说明；自定义字段为 null。" : "文档已修改：模拟值全部为 null，不执行真实抽取。"}`;
}

$("#add-field").addEventListener("click", () => {
  fields.push({ name: "", meaning: "", guidance: "", enabled: true });
  renderFields();
  update();
  $('#fields fieldset:last-child input:not([type="checkbox"])').focus();
});
$("#reset").addEventListener("click", () => {
  fields = structuredClone(initialFields);
  documentInput.value = documentText;
  renderFields();
  update();
});
documentInput.addEventListener("input", update);

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
  for (const [label, text] of [
    ["输入", data.input],
    ["输出", data.output],
  ]) {
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = label;
    dd.textContent = text;
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
renderFields();
update();
selectNode("assembly");

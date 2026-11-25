import { normalizeTypography, typographyFonts, typographyRoles, typographySize } from "../typography.js";

export function applyHeadingStyle(heading, { font, size, color } = {}) {
  heading.style.fontFamily = typographyFonts[font]?.family ?? "";
  heading.style.fontSize = size === undefined ? "" : `${size}px`;
  heading.style.color = color ?? "";
  return heading;
}

export function createStyleGuide(root, saveTypography, onSaved) {
  const dialog = root.querySelector("#style-guide");
  const form = root.querySelector("#style-guide-form");
  const fields = root.querySelector("#style-guide-fields");
  const status = root.querySelector("#style-guide-status");
  const save = root.querySelector("#style-guide-save");
  const cancel = root.querySelector("#style-guide-cancel");
  const controls = new Map();

  for (const [role, label] of Object.entries(typographyRoles)) {
    const row = document.createElement("div");
    row.className = "style-guide-row";
    const sample = document.createElement("span");
    sample.textContent = label;
    sample.className = "style-guide-sample";
    const font = document.createElement("select");
    font.setAttribute("aria-label", `${label} font`);
    font.append(new Option("Default", ""));
    for (const [key, { label: fontLabel }] of Object.entries(typographyFonts)) {
      font.append(new Option(fontLabel, key));
    }
    const size = document.createElement("input");
    size.type = "number";
    size.min = typographySize.min;
    size.max = typographySize.max;
    size.step = "1";
    size.placeholder = "Default";
    size.setAttribute("aria-label", `${label} size (px)`);
    const resetSize = document.createElement("button");
    resetSize.type = "button";
    resetSize.textContent = "Reset";
    resetSize.setAttribute("aria-label", `Reset ${label} size`);
    const sizeControl = document.createElement("div");
    sizeControl.className = "style-guide-control";
    sizeControl.append(size, resetSize);

    const color = document.createElement("input");
    color.type = "color";
    color.setAttribute("aria-label", `${label} color`);
    const resetColor = document.createElement("button");
    resetColor.type = "button";
    resetColor.textContent = "Default";
    resetColor.setAttribute("aria-label", `Use default color for ${label}`);
    const colorControl = document.createElement("div");
    colorControl.className = "style-guide-control";
    colorControl.append(color, resetColor);
    const state = { font, size, color, customColor: undefined, updateSample };

    function updateSample() {
      const px = size.valueAsNumber;
      const validSize = Number.isInteger(px) && px >= typographySize.min && px <= typographySize.max;
      applyHeadingStyle(sample, {
        font: font.value, size: validSize ? px : undefined, color: state.customColor,
      });
      resetSize.disabled = size.value === "";
      resetColor.disabled = state.customColor === undefined;
    }
    font.addEventListener("change", updateSample);
    size.addEventListener("input", updateSample);
    resetSize.addEventListener("click", () => {
      size.value = "";
      updateSample();
    });
    color.addEventListener("input", () => {
      state.customColor = color.value;
      updateSample();
    });
    resetColor.addEventListener("click", () => {
      state.customColor = undefined;
      color.value = "#28241d";
      updateSample();
    });
    row.append(sample, font, sizeControl, colorControl);
    fields.append(row);
    controls.set(role, state);
  }

  function show(settings) {
    status.textContent = "";
    for (const [role, state] of controls) {
      const { font, size, color, updateSample } = state;
      font.value = settings[role]?.font ?? "";
      size.value = settings[role]?.size ?? "";
      state.customColor = settings[role]?.color;
      color.value = state.customColor ?? "#28241d";
      updateSample();
    }
    dialog.showModal();
  }

  cancel.addEventListener("click", () => dialog.close());
  dialog.addEventListener("cancel", event => {
    if (save.disabled) event.preventDefault();
  });

  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (save.disabled) return;
    status.textContent = "";
    save.disabled = true;
    cancel.disabled = true;
    try {
      const settings = {};
      for (const [role, { font, size, customColor }] of controls) {
        settings[role] = {
          font: font.value || undefined,
          size: size.value ? size.valueAsNumber : undefined,
          color: customColor,
        };
      }
      const configuration = await saveTypography(normalizeTypography(settings));
      dialog.close();
      onSaved(configuration);
    } catch (error) {
      status.textContent = error.message;
    } finally {
      save.disabled = false;
      cancel.disabled = false;
    }
  });

  return { show };
}


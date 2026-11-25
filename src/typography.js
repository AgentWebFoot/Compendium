export const typographyRoles = {
  title: "Compendium title",
  pageTitle: "Page titles",
  entryTitle: "Entry and class titles",
  sectionHeading: "Section and rank headings",
  heading1: "Text heading 1 (#)",
  heading2: "Text heading 2 (##)",
  heading3: "Text heading 3 (###)",
};

export const typographyFonts = {
  system: { label: "System", family: "system-ui, sans-serif" },
  georgia: { label: "Georgia", family: "Georgia, serif" },
  times: { label: "Times New Roman", family: '"Times New Roman", serif' },
  arial: { label: "Arial", family: "Arial, sans-serif" },
  verdana: { label: "Verdana", family: "Verdana, sans-serif" },
  monospace: { label: "Monospace", family: "monospace" },
};

export const typographySize = { min: 10, max: 72 };

export function normalizeTypography(settings = {}) {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    throw new TypeError("Choose valid typography settings.");
  }
  const normalized = {};
  for (const [role, style] of Object.entries(settings)) {
    if (!Object.hasOwn(typographyRoles, role) || !style || typeof style !== "object" || Array.isArray(style)) {
      throw new TypeError("Choose a valid typography role.");
    }
    const { font, size, color } = style;
    if (font !== undefined && (typeof font !== "string" || !Object.hasOwn(typographyFonts, font))) {
      throw new TypeError("Choose a font from the Style Guide.");
    }
    if (size !== undefined && (!Number.isInteger(size) || size < typographySize.min || size > typographySize.max)) {
      throw new TypeError(`Choose a whole font size from ${typographySize.min} to ${typographySize.max} pixels.`);
    }
    if (color !== undefined && (typeof color !== "string" || !/^#[\da-f]{6}$/i.test(color))) {
      throw new TypeError("Choose a valid text color.");
    }
    if (font !== undefined || size !== undefined || color !== undefined) {
      normalized[role] = {
        ...(font === undefined ? {} : { font }),
        ...(size === undefined ? {} : { size }),
        ...(color === undefined ? {} : { color: color.toLowerCase() }),
      };
    }
  }
  return normalized;
}


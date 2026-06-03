export function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function pluralizeLabel(label: string) {
  return label.toLowerCase().endsWith("s") ? label : `${label}s`;
}

export function replaceEntityLabel(text: string, oldLabel: string, newLabel: string) {
  let nextText = text;
  if (!oldLabel.toLowerCase().endsWith("s")) {
    nextText = nextText.replace(
      new RegExp(`\\b${escapeRegExp(oldLabel)}s\\b`, "gi"),
      pluralizeLabel(newLabel),
    );
  }
  return nextText.replace(new RegExp(`\\b${escapeRegExp(oldLabel)}\\b`, "gi"), newLabel);
}

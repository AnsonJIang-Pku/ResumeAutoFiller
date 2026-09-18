import type { AtsAdapter, AdapterContext, FieldDescriptor } from "./types";

function pageIdentity(context: AdapterContext): string {
  const bodyText = context.document.body?.textContent?.slice(0, 3000) ?? "";
  return `${context.hostname} ${context.document.title} ${bodyText}`.toLocaleLowerCase();
}

const genericAdapter: AtsAdapter = {
  id: "generic",
  displayName: "通用表单",
  detect: () => true
};

// These adapters deliberately only identify a platform. Without a verified DOM
// contract they must not override generic matching or claim support for internals.
const beiSenAdapter: AtsAdapter = {
  id: "beisen-observer",
  displayName: "北森（通用安全模式）",
  detect: (context) => /beisen|北森/i.test(pageIdentity(context))
};

const mokaAdapter: AtsAdapter = {
  id: "moka-observer",
  displayName: "Moka（通用安全模式）",
  detect: (context) => /moka|魔卡/i.test(pageIdentity(context))
};

export const ATS_ADAPTERS: AtsAdapter[] = [beiSenAdapter, mokaAdapter, genericAdapter];

export function detectAdapter(context: AdapterContext): AtsAdapter {
  return ATS_ADAPTERS.find((adapter) => adapter.id !== "generic" && adapter.detect(context)) ?? genericAdapter;
}

export function applyAdapterHints(adapter: AtsAdapter, field: FieldDescriptor): FieldDescriptor {
  return { ...field, ...(adapter.enrichField?.(field) ?? {}) };
}

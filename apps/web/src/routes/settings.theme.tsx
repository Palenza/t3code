import { createFileRoute } from "@tanstack/react-router";

import { ThemeSettingsPanel } from "../components/settings/ThemeSettings";

export const Route = createFileRoute("/settings/theme")({
  component: ThemeSettingsPanel,
});

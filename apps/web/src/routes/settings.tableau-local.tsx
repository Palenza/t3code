import { createFileRoute } from "@tanstack/react-router";

import { TableauLocalSettingsPanel } from "../components/settings/TableauLocalSettings";

export const Route = createFileRoute("/settings/tableau-local")({
  component: TableauLocalSettingsPanel,
});

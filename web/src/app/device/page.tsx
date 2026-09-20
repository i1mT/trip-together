import { DeviceApproval } from "@/components/device/approval";
import { ProviderShell } from "@/components/shell/provider-shell";
export const metadata = { title: "授权旅行助手" };
export default function Device() {
  return (
    <ProviderShell>
      <DeviceApproval />
    </ProviderShell>
  );
}

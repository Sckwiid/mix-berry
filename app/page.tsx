import { SmoothieExplorer } from "@/components/SmoothieExplorer";
import { getDatasetMeta } from "@/lib/dataset";

export default async function HomePage() {
  const meta = await getDatasetMeta();
  return <SmoothieExplorer meta={meta} />;
}

export function clusterDisplayId(cluster: {
  state_code: string | null;
  sub_region_code: string | null;
  cluster_number: number | null;
}): string | null {
  if (
    !cluster.state_code ||
    !cluster.sub_region_code ||
    cluster.cluster_number == null
  )
    return null;
  const num = String(cluster.cluster_number).padStart(2, "0");
  return `${cluster.state_code} ${cluster.sub_region_code}${num}`;
}

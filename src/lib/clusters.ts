export function clusterDisplayId(cluster: {
  region_code: string | null;
  sub_region_code: string | null;
  cluster_code: string | null;
}): string | null {
  if (!cluster.region_code || !cluster.sub_region_code || !cluster.cluster_code)
    return null;
  return `${cluster.region_code} ${cluster.sub_region_code}${cluster.cluster_code}`;
}

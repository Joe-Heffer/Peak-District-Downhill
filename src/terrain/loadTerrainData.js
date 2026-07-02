export async function loadTerrainData(url = `${import.meta.env.BASE_URL}data/terrain/cutgate.json`) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load terrain data (${response.status})`);
  }
  return response.json();
}

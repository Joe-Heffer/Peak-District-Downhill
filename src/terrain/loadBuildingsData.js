export async function loadBuildingsData(url = `${import.meta.env.BASE_URL}data/terrain/cutgate-buildings.json`) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load buildings data (${response.status})`);
  }
  return response.json();
}

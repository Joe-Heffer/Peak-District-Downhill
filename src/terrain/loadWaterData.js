export async function loadWaterData(url = `${import.meta.env.BASE_URL}data/terrain/cutgate-water.json`) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load water data (${response.status})`);
  }
  return response.json();
}
